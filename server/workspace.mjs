import { createHmac, timingSafeEqual } from 'node:crypto';
import { Writable } from 'node:stream';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { cloudEnabled, withWorkspace, cloudContext, checkpoint, trustWorkspaceRequest, workspaceRoot, readFile } from './workspace-store.mjs';

export const accessCode = env => env.CONTENT_STUDIO_REVIEWER_TOKEN || createHmac('sha256',env.BLOB_READ_WRITE_TOKEN).update('gik-workspace-access-v1').digest('hex').slice(0,32);
const equal=(a,b)=>{const x=Buffer.from(a||''),y=Buffer.from(b||'');return x.length===y.length&&timingSafeEqual(x,y);};
const signature=(env,expiry)=>createHmac('sha256',accessCode(env)).update(expiry).digest('hex');
const json=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
function origin(req,local){const host=req.headers.host||'',o=req.headers.origin;if(local)return /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)&&['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket?.remoteAddress)&&(!o||o===`http://${host}`)&&!['cross-site','same-site'].includes(req.headers['sec-fetch-site']);return !!host&&(!o||o===`https://${host}`)&&!['cross-site','same-site'].includes(req.headers['sec-fetch-site']);}
function authorized(req,env,local){if(local)return true;const cookie=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('gik_workspace='))?.slice(14)||'';const [expires,sig]=cookie.split('.');return Number(expires)>Date.now()&&Number(expires)<Date.now()+9*3600000&&equal(signature(env,expires),sig);}
async function body(req,max=1024*1024){if(req.body!==undefined){if(Buffer.byteLength(JSON.stringify(req.body))>max)throw Error('Request too large');return req.body;}let text='';for await(const b of req){text+=b;if(Buffer.byteLength(text)>max)throw Error('Request too large');}return JSON.parse(text||'{}');}
class Capture extends Writable{
  constructor(){super();this.statusCode=200;this.headers={};this.chunks=[];this.done=new Promise(resolve=>this.on('finish',resolve));}
  setHeader(k,v){this.headers[k.toLowerCase()]=v;}getHeader(k){return this.headers[k.toLowerCase()];}
  writeHead(status,headers={}){this.statusCode=status;for(const [k,v]of Object.entries(headers))this.setHeader(k,v);this.headersSent=true;return this;}
  _write(chunk,encoding,cb){this.chunks.push(Buffer.from(chunk));cb();}
}
export async function runWorkspace(req,res,handler,{env=process.env,local=false,service='workspace'}={}){
  if(!cloudEnabled(env)){
    if(local&&service!=='workspace')return handler(req,res,{env,local});
    if(local&&service==='workspace'&&origin(req,true))return json(res,200,{authorized:true,mode:'local',revision:0,values:{}});
    return json(res,503,{message:'Shared workspace storage is not configured.',retryable:false});
  }
  try{
    if(!origin(req,local))return json(res,403,{message:'Use the workspace on its own website.',retryable:false});
    const url=new URL(req.url,'http://localhost'),action=url.searchParams.get('action')||'status';
    if(service==='workspace'&&action==='session'&&req.method==='POST'){
      if(req.headers['x-content-studio']!=='1')return json(res,403,{message:'Application request required.'});
      const input=await body(req,2048);if(!local&&!equal(String(input.token||''),accessCode(env)))return json(res,403,{message:'Workspace access code was not accepted.'});
      const expiry=String(Date.now()+8*3600000);res.setHeader('Set-Cookie',`gik_workspace=${expiry}.${signature(env,expiry)}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=28800${local?'':'; Secure'}`);return json(res,200,{authorized:true});
    }
    if(!authorized(req,env,local))return json(res,401,{message:'Enter the workspace access code to continue.',authorizationRequired:true,retryable:false});
    if(!['GET','HEAD'].includes(req.method)&&(req.headers['x-content-studio']!=='1'||!req.headers['content-type']?.startsWith('application/json')))return json(res,403,{message:'Application request required.'});
    // Read-only operations do not take a writer lease. Active jobs progress through job polling.
    const readonly=['GET','HEAD'].includes(req.method)&&action!=='job';
    await withWorkspace(env,async()=>{
      const ctx=cloudContext();
      ctx.env={...env,CONTENT_STUDIO_PUBLIC_ORIGIN:local?`http://${req.headers.host}`:`https://${req.headers.host}`};
      if(service==='workspace'){
        const current=ctx.value.records['browser.json']||{revision:0,values:{}};
        if(req.method==='GET')return json(res,200,{authorized:true,...current});
        const input=await body(req);
        if(input.revision!==current.revision)return json(res,409,{message:'This workspace changed in another session. Reload to review the latest version.',conflict:true});
        const keys=['content-studio-missions-v1','gik-custom-placements-v1'];
        if(!input.values||Object.keys(input.values).some(k=>!keys.includes(k))||Object.values(input.values).some(v=>typeof v!=='string'||v.length>500000))return json(res,400,{message:'Invalid workspace settings.'});
        const next={revision:current.revision+1,values:{...current.values,...input.values}};
        await writeFile(path.join(workspaceRoot(),'browser.json'),JSON.stringify(next));await checkpoint();return json(res,200,next);
      }
      // Large media is served by Blob, avoiding serverless response limits.
      const id=url.searchParams.get('id');
      if(['GET','HEAD'].includes(req.method)&&id&&/^[a-zA-Z0-9-]{1,200}$/.test(id)){
        const record=ctx.value.records[`deliveries/${id}.json`];
        const file=service==='stills'&&action==='image'?`stills/${id}.png`:service==='motion'&&action==='video'?`motion/${id}.mp4`:service==='deliveries'&&action==='file'&&record?`deliveries/${id}${url.searchParams.get('format')==='psd'?'.psd':record.kind==='motion'?'.mp4':'.png'}`:null;
        const media=file&&ctx.value.files[file];if(media){res.writeHead(307,{Location:media.url+(url.searchParams.has('download')?'?download=1':''),'Cache-Control':'no-store'});return res.end();}
      }
      trustWorkspaceRequest(req);
      if(service==='assistant'&&req.method==='POST'){
        const now=Date.now();ctx.value.assistantRequests=(ctx.value.assistantRequests||[]).filter(t=>now-t<60000);
        if(ctx.value.assistantRequests.length>=10||now-(ctx.value.assistantRequests.at(-1)||0)<3000)return json(res,429,{message:'Assistant is busy. Retry shortly.'});
        ctx.value.assistantRequests.push(now);await checkpoint();
      }
      const capture=new Capture();
      const scoped={...env,CONTENT_STUDIO_SHARED_CONTEXT:'true',CONTENT_STUDIO_DATA_DIR:path.join(workspaceRoot(),'stills'),CONTENT_STUDIO_MOTION_DATA_DIR:path.join(workspaceRoot(),'motion')};
      await handler(req,capture,{env:scoped,local:true});await capture.done;
      if(!readonly)await checkpoint();
      res.writeHead(capture.statusCode,capture.headers);res.end(Buffer.concat(capture.chunks));
    },{readonly});
  }catch(error){if(!res.headersSent)json(res,error.status||503,{message:error.status?error.message:'Shared workspace could not finish saving. Retry without creating a new generation request.',retryable:true});}
}
