import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash, createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import { readFile as fsRead, writeFile, mkdir, readdir, stat, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { get, put, head, copy, BlobNotFoundError, BlobPreconditionFailedError } from '@vercel/blob';

const context = new AsyncLocalStorage();
const trusted = new WeakSet();
export const trustWorkspaceRequest = req => trusted.add(req);
export const isWorkspaceRequest = req => trusted.has(req);
export const workspaceRoot = () => context.getStore()?.root || path.resolve('.local-data');
export const cloudContext = () => context.getStore();
export const cloudEnabled = env => !!env.BLOB_READ_WRITE_TOKEN && env.CONTENT_STUDIO_BLOB_SYNC !== 'false';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const prefix = env => env.CONTENT_STUDIO_BLOB_PREFIX || 'firefly-demo/workspace-v1';
const key = env => createHash('sha256').update('gik-state-v1:' + (env.CONTENT_STUDIO_STATE_SECRET || env.BLOB_READ_WRITE_TOKEN?.trim())).digest();
const name = env => `${prefix(env)}/state.bin`;
function seal(data, env) { const iv = randomBytes(12), c = createCipheriv('aes-256-gcm', key(env), iv); const b = Buffer.concat([c.update(JSON.stringify(data)), c.final()]); return Buffer.concat([iv, c.getAuthTag(), b]); }
function unseal(bytes, env) { const d = createDecipheriv('aes-256-gcm', key(env), bytes.subarray(0,12)); d.setAuthTag(bytes.subarray(12,28)); return JSON.parse(Buffer.concat([d.update(bytes.subarray(28)), d.final()]).toString()); }
const opts = env => ({token:env.BLOB_READ_WRITE_TOKEN?.trim(),access:'public',addRandomSuffix:false,cacheControlMaxAge:60});
// Public Blob caches mutable URLs. Read the authoritative ETag through HEAD,
// then fetch the immutable encrypted version whose bytes produced that ETag.
export async function readSnapshot(env) {
  try {
    const metadata = await head(name(env), {token:env.BLOB_READ_WRITE_TOKEN?.trim()});
    const hash = metadata.etag.replaceAll('"', '');
    const version = `${prefix(env)}/states/${hash}.bin`;
    let result = await get(version, opts(env));
    if (!result) {
      const boot=await copy(name(env),`${prefix(env)}/bootstrap/${randomUUID()}.bin`,opts(env));
      result=await get(boot.url,opts(env));
    } // Read legacy state through a fresh origin-side copy, never the mutable CDN URL.
    if (!result) return null;
    const bytes=Buffer.from(await new Response(result.stream).arrayBuffer());
    if(createHash('md5').update(bytes).digest('hex')!==hash) throw Object.assign(new Error('Workspace is refreshing. Retry shortly.'),{status:409,code:'WORKSPACE_BUSY'});
    return {value:unseal(bytes,env),etag:metadata.etag};
  } catch(e) { if(e instanceof BlobNotFoundError) return null; throw e; }
}
async function writeSnapshot(env,value,etag) {
  const bytes=seal(value,env),hash=createHash('md5').update(bytes).digest('hex');
  await put(`${prefix(env)}/states/${hash}.bin`,bytes,{...opts(env),contentType:'application/octet-stream',allowOverwrite:false});
  return put(name(env),bytes,{...opts(env),contentType:'application/octet-stream',...(etag?{ifMatch:etag,allowOverwrite:true}:{allowOverwrite:false})});
}
const busy = () => Object.assign(new Error('Workspace is saving another change. Retry shortly.'),{status:409,code:'WORKSPACE_BUSY'});
async function acquire(env) {
  const previous = await readSnapshot(env);
  if(!previous) throw Object.assign(new Error('Workspace migration has not completed.'),{status:503});
  if(previous.value.lease?.until>Date.now()) throw busy();
  const value=previous.value, owner=randomUUID();
  value.lease={owner,until:Date.now()+330000};
  try { const saved=await writeSnapshot(env,value,previous.etag);return {env,value,etag:saved.etag,owner}; }
  catch(e){if(e instanceof BlobPreconditionFailedError)throw busy();throw e;}
}
async function persist(ctx) {
  if(ctx.value.lease?.owner!==ctx.owner || ctx.value.lease.until<=Date.now()) throw busy();
  const result=await writeSnapshot(ctx.env,ctx.value,ctx.etag);ctx.etag=result.etag;ctx.committed=structuredClone(ctx.value);
}
function relative(file,root) { if(file instanceof URL)return null;const r=path.relative(root,path.resolve(file)).split(path.sep).join('/');return r && !r.startsWith('../') && !path.isAbsolute(r)?r:null; }
const allowed = r => /^(?:stills|motion)\/[a-zA-Z0-9-]+\.(?:png|mp4|jpg|json)$/.test(r) || /^deliveries\/[a-zA-Z0-9-]+\.(?:png|mp4|psd|json)$/.test(r) || ['explorations.json','browser.json'].includes(r);
export async function ensureLocal(file) {
  const ctx=context.getStore();if(!ctx)return file;
  if (typeof file === 'string' && ctx.env.CONTENT_STUDIO_PUBLIC_ORIGIN) {
    const rel=path.relative(path.resolve('public'),path.resolve(file)).split(path.sep).join('/');
    if(rel.startsWith('media/')&&!rel.includes('..')) {
      try {await stat(file);return file;}catch(e){if(e.code!=='ENOENT')throw e;}
      const cached=path.join(ctx.root,'cache',digest(rel)+path.extname(rel));
      try{await stat(cached);return cached;}catch{}
      const response=await fetch(new URL('/'+rel,ctx.env.CONTENT_STUDIO_PUBLIC_ORIGIN),{signal:AbortSignal.timeout(25000),redirect:'error'});
      if(!response.ok)throw Error('Source media unavailable');
      const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>100*1024*1024)throw Error('Source too large');
      await mkdir(path.dirname(cached),{recursive:true});await writeFile(cached,bytes);return cached;
    }
  }
  const r=relative(file,ctx.root),entry=ctx.value.files[r];if(!entry)return file;
  try { await stat(file);return file; } catch(e){if(e.code!=='ENOENT')throw e;}
  const response=await get(entry.url,{...opts(ctx.env),useCache:true});
  if(!response)throw Error('Saved media is unavailable');
  const bytes=Buffer.from(await new Response(response.stream).arrayBuffer());
  if(digest(bytes)!==entry.sha256)throw Error('Saved media hash mismatch');
  await mkdir(path.dirname(file),{recursive:true});await writeFile(file,bytes);ctx.baseline[r]=entry.sha256;return file;
}
export async function readFile(file,...args){return fsRead(await ensureLocal(file),...args);}
export function mediaEntry(file){const ctx=context.getStore();return ctx?.value.files[relative(file,ctx.root)];}
export async function checkpoint() {
  const ctx=context.getStore();if(!ctx||ctx.readonly)return;
  async function walk(dir) {
    for(const e of await readdir(dir,{withFileTypes:true})) {
      const file=path.join(dir,e.name);if(e.isDirectory()){await walk(file);continue;}
      const r=relative(file,ctx.root);if(!allowed(r))continue;
      const bytes=await fsRead(file),sha256=digest(bytes);if(ctx.baseline[r]===sha256)continue;
      if(r.endsWith('.json'))ctx.value.records[r]=JSON.parse(bytes.toString());
      else {
        const extension=path.extname(r),mime=extension==='.mp4'?'video/mp4':extension==='.psd'?'image/vnd.adobe.photoshop':extension==='.jpg'?'image/jpeg':'image/png';
        const uploaded=await put(`${prefix(ctx.env)}/media/${sha256}${extension}`,bytes,{...opts(ctx.env),allowOverwrite:true,contentType:mime});
        ctx.value.files[r]={url:uploaded.url,sha256,size:bytes.length};
      }
      ctx.baseline[r]=sha256;
    }
  }
  await walk(ctx.root);await persist(ctx);
}
async function release(ctx) {
  // Use only committed state. Check ownership before retrying an uncertain write.
  let value=structuredClone(ctx.committed),etag=ctx.etag;
  for(let attempt=0;attempt<3;attempt++) {
    value.lease=null;
    try { await writeSnapshot(ctx.env,value,etag); return; }
    catch(error) {
      const latest=await readSnapshot(ctx.env);
      if(!latest || latest.value.lease?.owner!==ctx.owner)return;
      if(attempt===2)throw Object.assign(new Error('The change is saved, but workspace cleanup could not finish. Retry shortly.'),{status:503});
      value=structuredClone(latest.value);etag=latest.etag;
    }
  }
}
export async function withWorkspace(env,operation,{readonly=false,waitMs=0}={}) {
  const deadline=Date.now()+waitMs;
  let current;
  for(;;) {
    try { current=readonly?await readSnapshot(env):await acquire(env); break; }
    catch(error) {
      if(readonly || error.code!=='WORKSPACE_BUSY' || Date.now()>=deadline)throw error;
      await new Promise(resolve=>setTimeout(resolve,250+Math.random()*250));
    }
  }
  if(!current)throw Object.assign(new Error('Workspace migration has not completed.'),{status:503});
  const root=await mkdtemp(path.join(tmpdir(),'gik-'));
  const ctx={...current,env,root,readonly,baseline:{},committed:structuredClone(current.value)};
  try {
    for(const [r,data] of Object.entries(ctx.value.records)) {
      if(!allowed(r))throw Error('Invalid workspace record');
      const file=path.join(root,r),text=JSON.stringify(data);await mkdir(path.dirname(file),{recursive:true});await writeFile(file,text);ctx.baseline[r]=digest(text);
    }
    await Promise.all(['stills','motion','deliveries'].map(d=>mkdir(path.join(root,d),{recursive:true})));
    return await context.run(ctx,operation);
  } finally {
    try { if(!readonly)await release(ctx); }
    finally { await rm(root,{recursive:true,force:true}); }
  }
}
export async function migrateWorkspace(env,source) {
  if(await readSnapshot(env))throw Error('Shared workspace already exists; migration will not overwrite it.');
  const value={version:1,records:{},files:{},lease:{owner:randomUUID(),until:Date.now()+330000}};
  // Migration builds a private snapshot first; publish only after every asset uploads.
  const ctx={env,value,root:path.resolve(source),baseline:{},owner:value.lease.owner,readonly:false};
  async function walk(dir){for(const e of await readdir(dir,{withFileTypes:true})){
    const f=path.join(dir,e.name);if(e.isDirectory()){if(['stills','motion','deliveries'].includes(e.name))await walk(f);continue;}
    const r=relative(f,ctx.root);if(!allowed(r))continue;
    const b=await fsRead(f);if(r.endsWith('.json'))value.records[r]=JSON.parse(b.toString());else{
      const ext=path.extname(r),sha256=digest(b);const uploaded=await put(`${prefix(env)}/media/${sha256}${ext}`,b,{...opts(env),allowOverwrite:true,contentType:ext==='.mp4'?'video/mp4':ext==='.psd'?'image/vnd.adobe.photoshop':ext==='.jpg'?'image/jpeg':'image/png'});
      value.files[r]={url:uploaded.url,sha256,size:b.length};
    }
  }}
  await walk(ctx.root);value.lease=null;await writeSnapshot(env,value);
  return {records:Object.keys(value.records).length,media:Object.keys(value.files).length};
}

