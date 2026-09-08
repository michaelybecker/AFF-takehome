import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import path from 'node:path';
import { put, del } from '@vercel/blob';
import { publicJob as stillJob } from './stills.mjs';
import { publicJob as motionJob } from './motion.mjs';

const state = globalThis[Symbol.for('studio.explorations')] ||= { busy: false };
const registry = path.resolve('.local-data/explorations.json');
async function readRegistry() {
  try { return JSON.parse(await readFile(registry, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return { entries: [], removed: [] }; throw error; }
}
async function save(value) {
  await mkdir(path.dirname(registry), { recursive: true });
  await writeFile(registry + '.tmp', JSON.stringify(value), { mode: 0o600 });
  await rename(registry + '.tmp', registry);
}
const reply = (res, status, value) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
export async function handleExplorations(req, res, { env }) {
  const host = req.headers.host || '';
  if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) || !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress) || (req.headers.origin && req.headers.origin !== `http://${host}`) || ['cross-site', 'same-site'].includes(req.headers['sec-fetch-site'])) return reply(res, 403, { message: 'Use project curation from the local application.' });
  let locked = false;
  try {
    if (req.method === 'GET') {
      const data = await readRegistry();
      return reply(res, 200, { assets: data.entries.filter(e => e.status === 'ready').map(e => e.asset), removed: data.removed });
    }
    if (req.method !== 'POST' || req.headers['x-content-studio'] !== '1' || !req.headers['content-type']?.startsWith('application/json')) return reply(res, 405, { message: 'Use the application curation controls.' });
    if (state.busy) return reply(res, 409, { message: 'Another curation change is running. Retry shortly.' });
    state.busy = true; locked = true;
    let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 1024) return reply(res, 413, { message: 'Request too large.' }); }
    const input = JSON.parse(body);
    if (!['save', 'delete'].includes(input.action) || typeof input.id !== 'string' || !/^[a-zA-Z0-9-]{1,200}$/.test(input.id) || !['still', 'motion'].includes(input.kind)) return reply(res, 400, { message: 'Invalid exploration selection.' });
    const data = await readRegistry();
    const existing = data.entries.find(e => e.asset.id === input.id);
    const manifest = JSON.parse(await readFile(new URL('../public/media/manifest.json', import.meta.url), 'utf8'));
    if (input.action === 'delete') {
      const root = path.resolve(input.kind === 'still' ? env.CONTENT_STUDIO_DATA_DIR || '.local-data/stills' : env.CONTENT_STUDIO_MOTION_DATA_DIR || '.local-data/motion');
      let generated = false;
      try { const jobs = JSON.parse(await readFile(path.join(root, 'jobs.json'), 'utf8')); generated = jobs.jobs.some(j => j.id === input.id && j.status === 'completed'); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (!existing && !(manifest.campaignMasters || []).some(a => a.id === input.id) && !generated && !data.removed.includes(input.id)) return reply(res, 404, { message: 'Sandbox item not found.' });
      if (existing) {
        const token = env.BLOB_READ_WRITE_TOKEN;
        if (existing.paths.length && !token) return reply(res, 503, { message: 'Set BLOB_READ_WRITE_TOKEN on the server.' });
        existing.status = 'deleting'; await save(data);
        // Delete only objects owned by this registry, never shared identity/reference files.
        if (existing.paths.some(p => !p.startsWith('firefly-demo/project-explorations/'))) throw new Error('Invalid owned path');
        if (existing.paths.length) {
          await del(existing.paths, { token });
        }
      }
      data.entries = data.entries.filter(e => e.asset.id !== input.id);
      data.removed = [...new Set([...data.removed, input.id])]; await save(data);
      return reply(res, 200, { deleted: input.id });
    }
    const token = env.BLOB_READ_WRITE_TOKEN;
    if (!token) return reply(res, 503, { message: 'Set BLOB_READ_WRITE_TOKEN on the server.' });
    if (existing?.status === 'ready') return reply(res, 200, { asset: existing.asset });
    if (existing?.status === 'deleting') return reply(res, 409, { message: 'Deletion is incomplete. Retry deleting this exploration first.' });
    let asset = (manifest.campaignMasters || []).find(a => a.id === input.id && a.kind === input.kind);
    let filename;
    if (asset) {
      filename = path.resolve('public', '.' + asset.src);
      if (!filename.startsWith(path.resolve('public/media') + path.sep)) throw new Error('Invalid media path');
    } else {
      const root = path.resolve(input.kind === 'still' ? env.CONTENT_STUDIO_DATA_DIR || '.local-data/stills' : env.CONTENT_STUDIO_MOTION_DATA_DIR || '.local-data/motion');
      const jobs = JSON.parse(await readFile(path.join(root, 'jobs.json'), 'utf8'));
      const job = jobs.jobs.find(j => j.id === input.id && j.status === 'completed');
      if (!job) return reply(res, 404, { message: 'Completed generation not found.' });
      asset = (input.kind === 'still' ? stillJob(job) : motionJob(job)).result;
      filename = path.join(root, input.id + (input.kind === 'still' ? '.png' : '.mp4'));
    }
    const bytes = await readFile(filename);
    const pathname = `firefly-demo/project-explorations/${input.kind}/${input.id}${path.extname(filename)}`;
    const entry = existing || { asset: { ...asset, prepared: true, blobBacked: true }, paths: [pathname], status: 'uploading' };
    if (!existing) data.entries.push(entry);
    await save(data);
    const uploaded = await put(pathname, bytes, { token, access: 'public', addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 60, contentType: input.kind === 'motion' ? 'video/mp4' : path.extname(filename) === '.webp' ? 'image/webp' : 'image/png' });
    entry.asset = { ...asset, src: uploaded.url, prepared: true, blobBacked: true };
    // Posters are existing shared identity assets; they are not copied or owned by this entry.
    if (entry.asset.poster?.startsWith('/api/')) delete entry.asset.poster;
    entry.status = 'ready'; data.removed = data.removed.filter(id => id !== input.id); await save(data);
    return reply(res, 200, { asset: entry.asset });
  } catch { return reply(res, 502, { message: 'Curation could not finish. Check Blob configuration and retry; private originals are unchanged.' }); }
  finally { if (locked) state.busy = false; }
}
