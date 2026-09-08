import { get } from '@vercel/blob';
import { createRequire } from 'node:module';
import { readFile, ensureLocal, workspaceRoot, checkpoint, isWorkspaceRequest } from './workspace-store.mjs';
import { writeFile, mkdir, rename, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import { writePsdBuffer } from 'ag-psd';
const exec = promisify(execFile);

const sizes = { A01: [1600, 2400, 'still'], A02: [1600, 2000, 'still'], A03: [1080, 1920, 'motion'], A04: [1920, 1080, 'motion'] };
const validId = x => typeof x === 'string' && /^[a-zA-Z0-9-]{1,200}$/.test(x);
const format = input => sizes[input.artifactId] || (validId(input.artifactId) && input.artifactId.startsWith('custom-') && ['still', 'motion'].includes(input.outputKind) && [input.dimensions?.width, input.dimensions?.height].every(n => Number.isInteger(n) && n >= 64 && n <= 4096 && (input.outputKind !== 'motion' || n % 2 === 0)) ? [input.dimensions.width, input.dimensions.height, input.outputKind] : null);
const json = (res, status, data) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
const read = async (file, fallback) => { try { return JSON.parse(await readFile(file, 'utf8')); } catch (e) { if (e.code === 'ENOENT') return fallback; throw e; } };
let rendering = false;
async function sourceFor(input, env) {
  const kind = format(input)[2];
  const dir = path.resolve(kind === 'still' ? env.CONTENT_STUDIO_DATA_DIR || '.local-data/stills' : env.CONTENT_STUDIO_MOTION_DATA_DIR || '.local-data/motion');
  const jobs = await read(path.join(dir, 'jobs.json'), { jobs: [] });
  const job = jobs.jobs.find(j => j.id === input.source && j.status === 'completed' && j.input.missionId === input.campaignId);
  if (job) return { file: path.join(dir, job.id + (kind === 'still' ? '.png' : '.mp4')), lineage: { jobId: job.id, sha256: job.sha256 } };
  const manifest = await read('public/media/manifest.json', {});
  const registry = await read(path.join(workspaceRoot(), 'explorations.json'), { entries: [] });
  const asset = [...(manifest.campaignMasters || []), ...registry.entries.map(e => e.asset)].find(a => a.id === input.source && a.campaignId === input.campaignId && a.kind === kind);
  if (asset?.src?.startsWith('https://') && new URL(asset.src).hostname.endsWith('.public.blob.vercel-storage.com')) {
    const saved = await get(asset.src, {token:env.BLOB_READ_WRITE_TOKEN,access:'public'});
    if(!saved)throw Error('Saved master unavailable.');
    const file=path.join(workspaceRoot(),'deliveries',`source-${input.id}.tmp`);
    await writeFile(file,Buffer.from(await new Response(saved.stream).arrayBuffer()));
    return {file,lineage:asset.lineage||{sourceId:asset.id}};
  }
  if (!asset?.src?.startsWith('/media/')) throw Error('The selected master is not available locally. Choose a completed project master.');
  const file = path.resolve('public', '.' + asset.src);
  if (!file.startsWith(path.resolve('public/media') + path.sep)) throw Error('Invalid source path.');
  return { file, lineage: asset.lineage || { sourceId: asset.id } };
}
async function render(input, env) {
  const root = path.join(workspaceRoot(), 'deliveries');
  const [width, height, kind] = format(input);
  const source = await sourceFor(input, env);
  source.file = await ensureLocal(source.file);
  const output = path.join(root, input.id + (kind === 'still' ? '.png' : '.mp4'));
  const x = input.layout.focalX / 100, y = input.layout.focalY / 100;
  let editable;
  if (kind === 'still') {
    const meta = await sharp(source.file).metadata();
    const scale = (input.layout.fit === 'cover' ? Math.max : Math.min)(width / meta.width, height / meta.height);
    const sw = Math.max(1, Math.round(meta.width * scale)), sh = Math.max(1, Math.round(meta.height * scale));
    let image = sharp(source.file).resize(sw, sh, { fit: 'fill' });
    const cw = Math.min(width, sw), ch = Math.min(height, sh);
    image = image.extract({ left: Math.round(Math.max(0, sw - width) * x), top: Math.round(Math.max(0, sh - height) * y), width: cw, height: ch });
    await sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([
      { input: await image.toBuffer(), left: Math.round(Math.max(0, width - sw) * x), top: Math.round(Math.max(0, height - sh) * y) }
    ]).png().toFile(output);
    const { data } = await sharp(output).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const imageData = { width, height, data: new Uint8ClampedArray(data) };
    const linkId = randomUUID();
    const left = Math.round((width - sw) * x), top = Math.round((height - sh) * y);
    const psd = writePsdBuffer({ width, height, imageData,
      children: [{ name: 'Artwork — edit contents in Photoshop', imageData,
        placedLayer: { id: linkId, placed: randomUUID(), type: 'raster',
          width: meta.width, height: meta.height,
          transform: [left, top, left + sw, top, left + sw, top + sh, left, top + sh] }
      }],
      linkedFiles: [{ id: linkId, name: path.basename(source.file), data: new Uint8Array(await readFile(source.file)) }]
    });
    await writeFile(path.join(root, input.id + '.psd'), psd);
    editable = { format: 'PSD', bytes: psd.length, src: `/api/deliveries?action=file&id=${input.id}&format=psd`, sourceWidth: meta.width, sourceHeight: meta.height, scale };
  } else {
    const framing = input.layout.fit === 'cover'
      ? `scale=${width}:${height}:force_original_aspect_ratio=increase:force_divisible_by=2,crop=${width}:${height}:(iw-ow)*${x}:(ih-oh)*${y}`
      : `scale=${width}:${height}:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=${width}:${height}:(ow-iw)*${x}:(oh-ih)*${y}:color=0x202020`;
    await exec(process.platform === 'linux' ? createRequire(import.meta.url).resolve('@ffmpeg-installer/linux-x64/ffmpeg') : 'ffmpeg', ['-y', '-v', 'error', '-i', source.file, '-vf', framing, '-map', '0:v:0', '-map', '0:a?', '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', output], { timeout: 180000, windowsHide: true });
  }
  const result = { id: input.id, campaignId: input.campaignId, artifactId: input.artifactId, title: input.placement, kind, width, height, sourceId: input.source, sourceLineage: source.lineage, createdAt: new Date().toISOString(), request: input, bytes: (await stat(output)).size, src: `/api/deliveries?action=file&id=${input.id}` };
  result.editable = editable;
  result.preparationVersion = 2;
  await writeFile(path.join(root, input.id + '.json.tmp'), JSON.stringify(result));
  await rename(path.join(root, input.id + '.json.tmp'), path.join(root, input.id + '.json'));
  await checkpoint();
  return result;
}
export async function handleDeliveries(req, res, { env = {} } = {}) {
  const root = path.join(workspaceRoot(), 'deliveries');
  try {
    const host = req.headers.host || '';
    if (!isWorkspaceRequest(req) && (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) || !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress) || (req.headers.origin && req.headers.origin !== `http://${host}`) || ['cross-site', 'same-site'].includes(req.headers['sec-fetch-site']))) return json(res, 403, { message: 'Local workspace access required.' });
    await mkdir(root, { recursive: true });
    const url = new URL(req.url, `http://${host}`), action = url.searchParams.get('action');
    if (req.method === 'GET' && action === 'list') {
      const { readdir } = await import('node:fs/promises');
      const records = await Promise.all((await readdir(root)).filter(f => f.endsWith('.json')).map(f => read(path.join(root, f))));
      return json(res, 200, records.filter(r => r.campaignId === url.searchParams.get('campaignId')).sort((a,b) => b.createdAt.localeCompare(a.createdAt)));
    }
    if (req.method === 'GET' && action === 'file') {
      const id = url.searchParams.get('id'); if (!validId(id)) return json(res, 400, { message: 'Invalid output.' });
      const record = await read(path.join(root, id + '.json')); if (!record) return json(res, 404, { message: 'Output not found.' });
      const psd = url.searchParams.get('format') === 'psd';
      if (psd && !record.editable) return json(res, 404, { message: 'Prepare this format again to create an editable PSD.' });
      const ext = psd ? '.psd' : record.kind === 'still' ? '.png' : '.mp4';
      if (psd) record.bytes = record.editable.bytes;
      const headers = { 'Content-Type': psd ? 'image/vnd.adobe.photoshop' : record.kind === 'still' ? 'image/png' : 'video/mp4', 'Accept-Ranges': 'bytes', 'Content-Disposition': `${url.searchParams.has('download') ? 'attachment' : 'inline'}; filename="${record.artifactId}-${id}${ext}"` };
      const range = req.headers.range;
      let start = 0, end = record.bytes - 1;
      if (range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(range);
        if (!match || (!match[1] && !match[2])) { res.writeHead(416, { 'Content-Range': `bytes */${record.bytes}` }); res.end(); return; }
        start = match[1] ? Number(match[1]) : Math.max(0, record.bytes - Number(match[2]));
        end = match[1] && match[2] ? Math.min(Number(match[2]), end) : end;
        if (start > end || start >= record.bytes) { res.writeHead(416, { 'Content-Range': `bytes */${record.bytes}` }); res.end(); return; }
        headers['Content-Range'] = `bytes ${start}-${end}/${record.bytes}`;
      }
      res.writeHead(range ? 206 : 200, { ...headers, 'Content-Length': end - start + 1 });
      const stream = createReadStream(path.join(root, id + ext), { start, end }); stream.on('error', () => res.destroy()); stream.pipe(res); return;
    }
    if (req.method !== 'POST') return json(res, 405, { message: 'Method not supported.' });
    let body = ''; if (req.body === undefined) for await (const chunk of req) { body += chunk; if (body.length > 30000) return json(res, 413, { message: 'Layout too large.' }); }
    const input = req.body !== undefined ? req.body : JSON.parse(body);
    if (input.layout) input.layout.graphics = false; input.copy = { headline: '', supporting: '', cta: '' };
    if (!validId(input.id) || !validId(input.campaignId) || !validId(input.source) || !format(input) || !['contain','cover'].includes(input.layout?.fit) || ![input.layout.focalX,input.layout.focalY].every(n => Number.isFinite(n) && n >= 0 && n <= 100) || typeof input.layout.graphics !== 'boolean' || !['headline','supporting','cta'].every(k => typeof input.copy?.[k] === 'string' && input.copy[k].length <= 100)) return json(res, 400, { message: 'Choose a master and complete the layout.' });
    const prior = await read(path.join(root, input.id + '.json')); if (prior) return json(res, 200, prior);
    if (rendering) return json(res, 409, { message: 'An output is rendering. Try again when it finishes.' });
    rendering = true;
    try { return json(res, 200, await render(input, env)); } finally { rendering = false; }
  } catch (error) { console.error('Delivery rendering:', error.message); return json(res, 500, { message: 'Output could not be rendered. Check the selected master and try again.' }); }
}
