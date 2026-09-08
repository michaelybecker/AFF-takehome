import { readFile, ensureLocal, checkpoint, isWorkspaceRequest, mediaEntry } from './workspace-store.mjs';
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, rename, open, unlink } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { diagnostics, recordDiagnostics, recoveryReason } from './job-diagnostics.mjs';

const methods = ['image-to-video', 'reference-to-video'];
// Exact uploads from the reviewed R&D run; client requests can select IDs, never URLs.
const legacyReferences = [
  { id: 'ID03-rain-airport-lora060-seed142', title: 'Rain airport', src: '/media/derived/samples/airport-takeoff-a.png',
    sha256: '9d50f458c8514ae0ffacd35702d259fd9d7739832d0f182ba646e6c148529e51', seed: 142,
    imageUrl: 'https://playgrounds-storage-public.runcomfy.net/eNpLNElLMjFIMtFNS0kx0TWxSE3STTRLM9VNMk5MNjQ1NDE2MzUDAL7mCcs%3D/eNozMjAy0zWw1DUwDzEytDIxtDI01zM2sbA0MdA2MLAyMAAAa6sGfA%3D%3D/input/image.png' },
  { id: 'Window08-film-cool-window-lora060-seed146', title: 'Cool window identity', src: '/media/derived/samples/08-film-cool-window-lora060-seed146.webp',
    sha256: 'f138cedfdc40c7999930bf90fa3769ec68af79bf2df284a0dc6502bcb68cec30', seed: 146,
    imageUrl: 'https://playgrounds-storage-public.runcomfy.net/eNpLNElLMjFIMtFNS0kx0TWxSE3STTRLM9VNMk5MNjQ1NDE2MzUDAL7mCcs%3D/eNozMjAy0zWw1DUwDzEytDK2tDK11DMyN7MwtNQ2MLAyMAAAbJgGjg%3D%3D/input/image.png' },
];
let hostedReferences = [];
try { hostedReferences = JSON.parse(readFileSync(new URL('./hosted-references.json', import.meta.url), 'utf8')).references; }
catch (error) { if (error.code !== 'ENOENT') throw error; }
hostedReferences = hostedReferences.filter(reference => !reference.aliases?.includes('23-collectors-icon'));
const curatedReferences = [...legacyReferences.filter(ref => !hostedReferences.some(item => item.src === ref.src)), ...hostedReferences];
const pricing = {
  'image-to-video': { estimatedCostPerSecond: 0.045, estimatedCostPerReference: 0, reservationCostPerSecond: 0.088 },
  'reference-to-video': { estimatedCostPerSecond: 0.09, estimatedCostPerReference: 0.03, reservationCostPerSecond: 0.09 },
};
const api = 'https://model-api.runcomfy.net/v1';
const active = new Set(['submitting', 'queued', 'running', 'recovering', 'unknown']);
const idPattern = /^[a-zA-Z0-9-]{1,80}$/;
const fields = ['id', 'missionId', 'missionTitle', 'direction', 'identityKitVersion', 'sourceId', 'seed', 'duration', 'mode', 'referenceIds'];
const sessionSecret = randomUUID() + randomUUID();
const workers = new Set();
const runFile = promisify(execFile);
const pollWindow = 30 * 60 * 1000;
const mediaHosts = new Set(['serverless-api-storage.runcomfy.net', 'files.runcomfy.net', 'playgrounds-storage-public.runcomfy.net']);
for (const ref of hostedReferences) {
  const url = new URL(ref.imageUrl);
  if (url.protocol !== 'https:' || !/^[a-z0-9]+\.public\.blob\.vercel-storage\.com$/.test(url.hostname) || !/^[a-f0-9]{64}$/.test(ref.sha256)) throw new Error('Invalid hosted reference catalog');
  mediaHosts.add(url.hostname);
}
class PublicError extends Error { constructor(status, message) { super(message); this.status = status; } }
class ProviderError extends Error { constructor(status) { super('Provider request failed'); this.status = status; } }
const fail = (status, message) => { throw new PublicError(status, message); };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const equal = (a, b) => { const x = Buffer.from(a); const y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };
const send = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(body)); };
function config(env, local) {
  const apiKey = env.RUNCOMFY_API_KEY?.trim();
  return { shared: env.CONTENT_STUDIO_SHARED_CONTEXT === 'true', apiKey, local,
    enabled: local && env.CONTENT_STUDIO_LIVE_ENABLED === 'true' && env.CONTENT_STUDIO_MOTION_ENABLED !== 'false' && !!apiKey,
    root: path.resolve(env.CONTENT_STUDIO_MOTION_DATA_DIR || '.local-data/motion'),
    stillRoot: path.resolve(env.CONTENT_STUDIO_DATA_DIR || '.local-data/stills'),
    secret: env.CONTENT_STUDIO_REVIEWER_TOKEN || sessionSecret,
    ffprobe: env.CONTENT_STUDIO_FFPROBE_PATH || 'ffprobe' };
}
function originAllowed(req) {
  if (isWorkspaceRequest(req)) return true;
  const host = req.headers.host || '';
  return /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)
    && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket?.remoteAddress)
    && (!req.headers.origin || req.headers.origin === `http://${host}`)
    && !['cross-site', 'same-site'].includes(req.headers['sec-fetch-site']);
}
function authorized(req, cfg) {
  if (isWorkspaceRequest(req)) return true;
  const cookie = (req.headers.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith('cs_motionreviewer='))?.slice('cs_motionreviewer='.length) || '';
  const [expiry, signature] = cookie.split('.');
  return Number(expiry) > Date.now() && Number(expiry) < Date.now() + 9 * 3600000
    && equal(signature || '', createHmac('sha256', cfg.secret).update(expiry || '').digest('hex'));
}
async function boundedBytes(stream, maximum) {
  const chunks = []; let size = 0;
  for await (const chunk of stream) { const bytes = Buffer.from(chunk); size += bytes.length; if (size > maximum) throw new Error('Size limit exceeded'); chunks.push(bytes); }
  return Buffer.concat(chunks);
}
async function body(req) {
  if (!(req.headers['content-type'] || '').startsWith('application/json')) fail(415, 'JSON request required.');
  if (Number(req.headers['content-length']) > 8192) fail(413, 'Request too large.');
  if (req.body !== undefined) {
    if (Buffer.byteLength(JSON.stringify(req.body)) > 8192) fail(413, 'Request too large.');
    return req.body;
  }
  try { return JSON.parse((await boundedBytes(req, 8192)).toString('utf8')); } catch { fail(400, 'Invalid or oversized request.'); }
}
function validate(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(k => !fields.includes(k))) fail(400, 'Unsupported motion request setting.');
  for (const key of ['id', 'missionId', 'sourceId']) if (typeof input[key] !== 'string' || !idPattern.test(input[key])) fail(400, 'Invalid project, source or request identifier.');
  for (const [key, max] of [['missionTitle', 500], ['direction', 1500], ['identityKitVersion', 30]]) {
    if (typeof input[key] !== 'string' || !input[key].trim() || input[key].length > max || /[\u0000-\u0008]/.test(input[key])) fail(400, 'Incomplete or oversized creative brief.');
  }
  if (!Number.isInteger(input.seed) || input.seed < 0 || input.seed > 2147483647) fail(400, 'Seed is out of range.');
  if (!Number.isInteger(input.duration) || input.duration < 5 || input.duration > 15) fail(400, 'Motion duration must be 5 to 15 whole seconds.');
  const mode = input.mode === undefined ? 'image-to-video' : input.mode;
  const referenceIds = input.referenceIds === undefined ? [] : input.referenceIds;
  if (!methods.includes(mode)) fail(400, 'Unsupported motion method.');
  if (!Array.isArray(referenceIds) || referenceIds.length > 3 || referenceIds.some(id => typeof id !== 'string' || !curatedReferences.some(ref => ref.id === id))
    || new Set(referenceIds).size !== referenceIds.length || referenceIds.includes(input.sourceId)) fail(400, 'Select distinct curated identity references, separate from the scene image.');
  if (mode === 'image-to-video' && referenceIds.length) fail(400, 'Identity references require reference-to-video mode.');
  return { ...Object.fromEntries(fields.map(key => [key, input[key]])), mode, referenceIds: [...referenceIds] };
}
async function load(cfg) {
  try {
    const state = JSON.parse(await readFile(path.join(cfg.root, 'jobs.json'), 'utf8'));
    if (!Array.isArray(state.jobs) || !Number.isFinite(state.reservedUsd) || state.reservedUsd < 0 || !Number.isFinite(state.lastSubmit)) throw new Error('Invalid ledger');
    return state;
  } catch (error) { if (error.code === 'ENOENT') return { jobs: [], reservedUsd: 0, lastSubmit: 0 }; throw error; }
}
async function atomicWrite(filename, bytes) {
  const temporary = `${filename}.${randomUUID()}.tmp`;
  const file = await open(temporary, 'wx', 0o600);
  try { await file.writeFile(bytes); await file.sync(); } finally { await file.close(); }
  await rename(temporary, filename);
}
const save = async (cfg, state) => { state.jobs.forEach(recordDiagnostics); await atomicWrite(path.join(cfg.root, 'jobs.json'), JSON.stringify(state)); await checkpoint(); };
async function locked(cfg, operation) {
  await mkdir(cfg.root, { recursive: true });
  let lock;
  try { lock = await open(path.join(cfg.root, 'jobs.lock'), 'wx', 0o600); }
  catch (error) { if (error.code === 'EEXIST') fail(429, 'Motion state is busy. Try again shortly.'); throw error; }
  try { return await operation(await load(cfg)); }
  finally { await lock.close(); await unlink(path.join(cfg.root, 'jobs.lock')); }
}
async function providerJson(cfg, url, options = {}) {
  if (!cfg.apiKey) throw new Error('Missing provider credential');
  const response = await fetch(url, { ...options, headers: { ...options.headers, Authorization: `Bearer ${cfg.apiKey}` }, signal: AbortSignal.timeout(20000), redirect: 'error' });
  if (!response.ok) { await response.body?.cancel(); throw new ProviderError(response.status); }
  return JSON.parse((await boundedBytes(response.body, 2 * 1024 * 1024)).toString('utf8'));
}
function mediaUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || (url.port && url.port !== '443') || !mediaHosts.has(url.hostname) || url.username || url.password || url.hash) throw new Error('Unexpected media URL');
  return url.href;
}
async function download(url, maximum, timeout) {
  const response = await fetch(mediaUrl(url), { signal: AbortSignal.timeout(timeout), redirect: 'error', credentials: 'omit' });
  if (!response.ok || Number(response.headers.get('content-length')) > maximum) { await response.body?.cancel(); throw new Error('Output unavailable or oversized'); }
  return boundedBytes(response.body, maximum);
}
export async function curatedStill(input, id) {
  const reference = curatedReferences.find(ref => ref.id === id);
  if (!reference) fail(400, 'Unknown curated reference.');
  const manifest = JSON.parse(await readFile(new URL('../public/media/manifest.json', import.meta.url), 'utf8'));
  if (manifest.version !== input.identityKitVersion) fail(409, 'Refresh the identity kit before using curated references.');
  let bytes;
  try { bytes = await download(reference.imageUrl, 20 * 1024 * 1024, 20000); }
  catch { fail(409, 'A curated reference upload is unavailable or expired. No motion was submitted.'); }
  if (hash(bytes) !== reference.sha256) fail(409, 'The curated reference does not match the verified original PNG.');
  const image = sharp(bytes, { limitInputPixels: 40 * 1024 * 1024, failOn: 'warning' });
  const metadata = await image.metadata();
  await image.stats();
  if (!metadata.width || !metadata.height || metadata.format !== 'png') fail(409, 'The curated reference is not a valid PNG.');
  return { ...reference, width: metadata.width, height: metadata.height,
    lora: reference.hosted ? reference.lora : { adaptationId: 'mark-iii-studio-identity-v0.1', checkpoint: 750, strength: 0.6, model: 'FLUX.2 Klein Base 4B', seed: reference.seed,
      contribution: 'selected-still conditioning', loadedByMotionModel: false } };
}
async function sourceStill(cfg, input) {
  if (curatedReferences.some(ref => ref.id === input.sourceId)) return curatedStill(input, input.sourceId);
  const state = JSON.parse(await readFile(path.join(cfg.stillRoot, 'jobs.json'), 'utf8'));
  const job = state.jobs?.find(j => j.id === input.sourceId);
  if (!job || job.status !== 'completed' || !['serverless', 'krea'].includes(job.backend) || job.input?.missionId !== input.missionId || job.input.identityKitVersion !== input.identityKitVersion
    || !idPattern.test(job.providerId || '') || (job.backend !== 'krea' && !/^[0-9a-f-]{36}$/.test(job.deploymentId || '')) || !/^[a-f0-9]{64}$/.test(job.sha256 || '')) fail(409, 'Select a completed live still from this project and identity kit.');
  const manifest = JSON.parse(await readFile(new URL('../public/media/manifest.json', import.meta.url), 'utf8'));
  if (manifest.version !== input.identityKitVersion) fail(409, 'Refresh the identity kit and select a matching live still.');
  const localImage = await readFile(path.join(cfg.stillRoot, `${job.id}.png`));
  if (localImage.length > 20 * 1024 * 1024 || hash(localImage) !== job.sha256) fail(409, 'The saved source still needs verification.');
  const durable = mediaEntry(path.join(cfg.stillRoot, `${job.id}.png`));
  if (durable) {
    const metadata = await sharp(localImage).metadata();
    return { id: job.id, imageUrl: durable.url, src: durable.url, sha256: job.sha256, width: metadata.width, height: metadata.height,
      lora: { adaptationId: job.input.adaptationId, checkpoint: job.backend === 'krea' ? 1500 : 750, model: job.backend === 'krea' ? 'Krea 2 Turbo' : 'FLUX.2 Klein Base 4B', strength: job.settings?.scale, seed: job.input.seed, contribution: 'selected-still conditioning', loadedByMotionModel: false } };
  }
  let record;
  try { record = await providerJson(cfg, job.backend === 'krea' ? `https://model-api.runcomfy.net/v1/requests/${job.providerId}/result` : `https://api.runcomfy.net/prod/v2/deployments/${job.deploymentId}/requests/${job.providerId}/result`); }
  catch { fail(409, 'The selected still provider result is currently unavailable. No motion was submitted.'); }
  if (record.status && !['completed', 'succeeded'].includes(record.status)) fail(409, 'The source still provider result is not ready.');
  const output = job.backend === 'krea' ? { type: 'output', url: record.output?.images?.[0] } : record.outputs?.['2']?.images?.[0];
  if (output?.type !== 'output' || typeof output.url !== 'string') fail(409, 'The source still provider image is unavailable.');
  const imageUrl = mediaUrl(output.url);
  let bytes;
  try { bytes = await download(imageUrl, 20 * 1024 * 1024, 20000); }
  catch { fail(409, 'The selected still image URL is unavailable or expired. No motion was submitted.'); }
  if (bytes.length < 24 || hash(bytes) !== (job.backend === 'krea' ? job.nativeSha256 : job.sha256)) fail(409, 'The provider image does not match the selected still.');
  const image = sharp(bytes, { limitInputPixels: 40 * 1024 * 1024, failOn: 'warning' });
  const metadata = await image.metadata();
  await image.stats();
  if (!metadata.width || !metadata.height || !['png', 'jpeg', 'webp'].includes(metadata.format)) fail(409, 'The source still is not a valid image.');
  return { id: job.id, providerId: job.providerId, deploymentId: job.deploymentId, sha256: job.sha256, imageUrl,
    width: metadata.width, height: metadata.height, providerResult: record,
    lora: { adaptationId: job.input.adaptationId, checkpoint: job.backend === 'krea' ? 1500 : 750, model: job.backend === 'krea' ? 'Krea 2 Turbo' : 'FLUX.2 Klein Base 4B', strength: job.settings?.scale, seed: job.input.seed, contribution: 'selected-still conditioning', loadedByMotionModel: false } };
}
export function publicJob(job) {
  return { id: job.id, diagnostics: diagnostics(job), missionId: job.input.missionId, status: job.status, execution: 'live', createdAt: job.createdAt,
    mode: job.input.mode || 'image-to-video', referenceIds: job.input.referenceIds || [], model: job.model,
    estimatedCostUsd: job.estimatedCostUsd ?? null, reservationUsd: job.reservationUsd,
    lastCheckedAt: job.lastCheckedAt || null, direction: job.input.direction, sourceId: job.input.sourceId, message: job.message || '',
    reconciliationRequired: job.status === 'unknown' || (active.has(job.status) && Date.now() - Date.parse(job.createdAt) >= pollWindow),
    result: job.status === 'completed' ? {
      id: job.id, campaignId: job.input.missionId, title: `${job.input.missionTitle} / Motion ${job.input.seed}`, kind: 'motion',
      prompt: job.input.direction,
      src: `/api/motion?action=video&id=${job.id}`, poster: job.source.src || `/api/stills?action=image&id=${job.input.sourceId}`,
      width: job.media.width, height: job.media.height, duration: job.media.duration, durationSource: job.media.durationSource,
      lineage: { jobId: job.id, sourceStillId: job.input.sourceId, sourceId: job.input.sourceId, parentId: job.input.sourceId,
        identityKitVersion: job.input.identityKitVersion, model: job.model, mode: job.input.mode || 'image-to-video', seed: job.input.seed, sha256: job.sha256,
        referenceIds: job.input.referenceIds || [], referenceCount: job.input.mode === 'reference-to-video' ? 1 + (job.references || []).length : 0,
        references: (job.references || []).map(ref => ({ id: ref.id, sha256: ref.sha256, sourceLoRA: ref.lora })),
        sourceSha256: job.source.sha256, sourceLoRA: job.source.lora, motionLoadsLoRA: false, requestedDuration: job.input.duration,
        durationSource: job.media.durationSource, dimensionsSource: job.media.dimensionsSource, review: 'pending', execution: 'live' },
    } : null };
}
function mp4Metadata(bytes, requestedDuration) {
  // Read bounded ISO BMFF boxes so deployments need no native executable for display metadata.
  const boxes = (start, end) => {
    const result = [];
    for (let offset = start; offset < end;) {
      if (offset + 8 > end || result.length >= 10000) throw new Error('Invalid MP4 box');
      let size = bytes.readUInt32BE(offset); let header = 8;
      if (size === 1) { if (offset + 16 > end) throw new Error('Truncated MP4'); size = Number(bytes.readBigUInt64BE(offset + 8)); header = 16; }
      if (size === 0) size = end - offset;
      if (!Number.isSafeInteger(size) || size < header || offset + size > end) throw new Error('Invalid MP4 length');
      result.push({ type: bytes.toString('ascii', offset + 4, offset + 8), start: offset + header, end: offset + size });
      offset += size;
    }
    return result;
  };
  const top = boxes(0, bytes.length);
  const movie = top.find(b => b.type === 'moov');
  if (!movie || !top.some(b => b.type === 'mdat' && b.end > b.start)) throw new Error('Missing movie data');
  for (const track of boxes(movie.start, movie.end).filter(b => b.type === 'trak')) {
    const children = boxes(track.start, track.end);
    const media = children.find(b => b.type === 'mdia'); const header = children.find(b => b.type === 'tkhd');
    if (!media || !header) continue;
    const contents = boxes(media.start, media.end); const handler = contents.find(b => b.type === 'hdlr');
    if (!handler || handler.end - handler.start < 12 || bytes.toString('ascii', handler.start + 8, handler.start + 12) !== 'vide') continue;
    const version = bytes[header.start];
    if (![0, 1].includes(version) || header.end - header.start < (version === 1 ? 96 : 84)) throw new Error('Invalid track header');
    const matrix = header.start + (version === 1 ? 52 : 40);
    const rotated = bytes.readInt32BE(matrix) === 0 && Math.abs(bytes.readInt32BE(matrix + 4)) === 65536;
    const width = bytes.readUInt32BE(header.start + (version === 1 ? 88 : 76)) / 65536;
    const height = bytes.readUInt32BE(header.start + (version === 1 ? 92 : 80)) / 65536;
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 8192 || height > 8192) throw new Error('Invalid video size');
    return { width: rotated ? height : width, height: rotated ? width : height, duration: requestedDuration,
      durationSource: 'requested', dimensionsSource: 'mp4-track-header' };
  }
  throw new Error('No video track');
}
async function probe(cfg, filename, requestedDuration, bytes) {
  const fallback = mp4Metadata(bytes, requestedDuration);
  let stdout;
  try {
    ({ stdout } = await runFile(cfg.ffprobe, ['-v', 'error', '-protocol_whitelist', 'file', '-show_streams', '-show_format', '-of', 'json', filename], { timeout: 15000, maxBuffer: 1024 * 1024, windowsHide: true }));
  } catch { return fallback; }
  const record = JSON.parse(stdout);
  const video = record.streams?.find(s => s.codec_type === 'video' && s.disposition?.attached_pic !== 1);
  if (!video || !Number.isInteger(video.width) || !Number.isInteger(video.height) || video.width < 1 || video.height < 1 || video.width > 8192 || video.height > 8192) throw new Error('Invalid video dimensions');
  const rotation = Number(video.side_data_list?.find(s => s.rotation !== undefined)?.rotation || video.tags?.rotate || 0);
  if (rotation % 90 !== 0) throw new Error('Unsupported display rotation');
  const rotated = Math.abs(rotation % 180) === 90;
  const duration = [Number(video.duration), Number(record.format?.duration)].find(value => Number.isFinite(value) && value > 0);
  if (Number.isFinite(duration) && (duration <= 0 || duration > 30)) throw new Error('Unexpected duration');
  return { width: rotated ? video.height : video.width, height: rotated ? video.width : video.height,
    duration: Number.isFinite(duration) && duration > 0 ? duration : requestedDuration,
    durationSource: Number.isFinite(duration) && duration > 0 ? 'measured' : 'requested', dimensionsSource: 'ffprobe', probe: record };
}
async function syncJob(cfg, id) {
  return locked(cfg, async state => {
    const job = state.jobs.find(j => j.id === id);
    if (!job) fail(404, 'Motion generation not found.');
    if (!active.has(job.status)) return publicJob(job);
    if (!job.providerId) { job.status = 'unknown'; job.message = 'Submission outcome unknown. Reviewer must reconcile before another run.'; await save(cfg, state); return publicJob(job); }
    if (Date.now() - Date.parse(job.createdAt) > pollWindow) {
      job.status = 'unknown'; job.message = 'Automatic polling stopped after 30 minutes. Reviewer must reconcile the provider request; no replacement will be submitted.';
      await save(cfg, state); return publicJob(job);
    }
    if (Date.now() - Date.parse(job.lastCheckedAt || '') < 4500) return publicJob(job);
    job.lastCheckedAt = new Date().toISOString();
    try {
      const progress = await providerJson(cfg, `${api}/requests/${job.providerId}/status`);
      job.providerStatus = progress;
      job.lastSuccessfulCheckAt = new Date().toISOString();
      if (['failed', 'error', 'cancelled', 'canceled'].includes(progress.status)) { job.status = 'failed'; job.message = 'The provider reported motion generation failed or was cancelled. No master was selected; the reservation remains counted.'; }
      else if (['completed', 'succeeded'].includes(progress.status)) {
        const result = await providerJson(cfg, `${api}/requests/${job.providerId}/result`);
        job.providerResult = result;
        if (result.status && !['completed', 'succeeded'].includes(result.status)) throw new Error('Result not ready');
        const output = result.output;
        const videoUrl = mediaUrl(output?.video || output?.videos?.[0]);
        job.status = 'recovering'; job.message = 'Receiving and checking the completed motion.';
        await save(cfg, state);
        const bytes = await download(videoUrl, 100 * 1024 * 1024, 60000);
        if (bytes.length < 32 || bytes.toString('ascii', 4, 8) !== 'ftyp' || bytes.readUInt32BE(0) < 16 || bytes.readUInt32BE(0) > bytes.length) throw new Error('Invalid MP4');
        const filename = path.join(cfg.root, `${job.id}.mp4`);
        await atomicWrite(filename, bytes);
        job.media = await probe(cfg, filename, job.input.duration, bytes);
        job.sha256 = hash(bytes); job.fileSize = bytes.length; job.outputUrl = videoUrl;
        job.status = 'completed'; job.message = 'Generated motion draft. Creative review required.';
      } else {
        job.status = progress.status === 'in_queue' ? 'queued' : progress.status === 'in_progress' ? 'running' : 'recovering';
        job.message = job.status === 'queued' ? 'Queued for motion generation.' : job.status === 'running' ? 'Generating motion from the selected still.' : 'Awaiting provider confirmation. New runs are blocked.';
      }
    } catch (error) { job.status = 'recovering'; job.message = `${recoveryReason(error)} Motion result recovery pending. New runs are blocked; no replacement has been submitted.`; }
    await save(cfg, state); return publicJob(job);
  });
}
function watch(cfg, id) {
  if (cfg.shared) return;
  const key = `${cfg.root}/${id}`;
  if (workers.has(key)) return;
  workers.add(key);
  const deadline = Date.now() + pollWindow;
  const tick = async () => {
    let again = Date.now() < deadline;
    try { const job = await syncJob(cfg, id); again = again && active.has(job.status) && !!cfg.apiKey && Date.now() - Date.parse(job.createdAt) < pollWindow; }
    catch { /* Retry reads only, never submission. Stop even if a stale lock persists. */ }
    if (again) { const timer = setTimeout(tick, 5000); timer.unref(); } else workers.delete(key);
  };
  const timer = setTimeout(tick, 5000); timer.unref();
}
async function serveVideo(req, res, cfg, id) {
  const state = await load(cfg);
  const job = state.jobs.find(j => j.id === id && j.status === 'completed');
  if (!job) fail(404, 'Saved motion result not found.');
  const file = await open(path.join(cfg.root, `${id}.mp4`), 'r');
  try {
    const { size } = await file.stat();
    if (size !== job.fileSize) fail(409, 'Saved motion needs verification.');
    let start = 0; let end = size - 1;
    const range = req.headers.range;
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match || (!match[1] && !match[2])) { res.setHeader('Content-Range', `bytes */${size}`); fail(416, 'Invalid video range.'); }
      if (match[1]) { start = Number(match[1]); end = match[2] ? Math.min(Number(match[2]), end) : end; }
      else { const suffix = Number(match[2]); start = Math.max(0, size - suffix); if (suffix === 0) start = size; }
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || end < start) { res.setHeader('Content-Range', `bytes */${size}`); fail(416, 'Video range is unavailable.'); }
    }
    res.writeHead(range ? 206 : 200, { 'Content-Type': 'video/mp4', 'Content-Length': end - start + 1, 'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', ...(range ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {}) });
    if (req.method === 'HEAD') return res.end();
    await pipeline(file.createReadStream({ start, end, autoClose: false }), res);
  } finally { await file.close(); }
}
export async function handleMotion(req, res, { local = false, env = process.env } = {}) {
  const cfg = config(env, local);
  try {
    if (!local) return send(res, 503, { message: 'Hosted live motion is unavailable. Hosted reviewer authentication, durable storage and distributed limits are not configured.' });
    if (!originAllowed(req)) fail(403, 'Reviewer access is required from the local application.');
    const url = new URL(req.url, 'http://localhost');
    const action = url.searchParams.get('action') || 'status';
    const method = ['session', 'submit', 'logout'].includes(action) ? 'POST' : 'GET';
    if (req.method !== method && !(action === 'video' && req.method === 'HEAD')) { res.setHeader('Allow', action === 'video' ? 'GET, HEAD' : method); fail(405, 'Method not allowed.'); }
    if (method === 'POST' && req.headers['x-content-studio'] !== '1') fail(403, 'Reviewer request verification failed.');
    if (action === 'session') {
      const input = await body(req);
      if (!isWorkspaceRequest(req) && env.CONTENT_STUDIO_REVIEWER_TOKEN && !equal(String(input?.token || ''), env.CONTENT_STUDIO_REVIEWER_TOKEN)) fail(403, 'Reviewer credential was not accepted.');
      if (!env.CONTENT_STUDIO_REVIEWER_TOKEN && input?.localReviewer !== true) fail(403, 'Local reviewer authorization is required.');
      const expiry = String(Date.now() + 8 * 3600000);
      const signature = createHmac('sha256', cfg.secret).update(expiry).digest('hex');
      res.setHeader('Set-Cookie', `cs_motionreviewer=${expiry}.${signature}; HttpOnly; SameSite=Strict; Path=/api/motion; Max-Age=28800`);
      return send(res, 200, { authorized: true });
    }
    if (action === 'logout') { res.setHeader('Set-Cookie', 'cs_motionreviewer=; HttpOnly; SameSite=Strict; Path=/api/motion; Max-Age=0'); return send(res, 200, { authorized: false }); }
    if (action === 'status') {
      const state = await load(cfg);
      const available = cfg.enabled;
      if (cfg.apiKey) for (const job of state.jobs.filter(j => active.has(j.status) && j.providerId && Date.now() - Date.parse(j.createdAt) < pollWindow)) watch(cfg, job.id);
      return send(res, 200, { available, temporary: false, authorized: !!authorized(req, cfg), tokenRequired: !isWorkspaceRequest(req) && !!env.CONTENT_STUDIO_REVIEWER_TOKEN,
        message: available ? 'Live animation available. Provider availability is checked on submission.' : 'Live animation is disabled or missing its local server configuration.',
        remainingJobs: null, allowanceLimited: false,
        activeJob: state.jobs.some(j => active.has(j.status)), videoAvailable: available, estimatedCostPerSecond: 0.045, resolution: '768p', maxDuration: 15,
        methods, curatedReferences: curatedReferences.map(({ id, title, src, group }) => ({ id, title, src, group: group || 'Generated images' })), pricing, maxReferenceImages: 4,
        remainingBudgetUsd: null, maxReservationUsd: null });
    }
    if (!authorized(req, cfg)) fail(401, 'Reviewer authorization required.');
    if (action === 'jobs') {
      const missionId = url.searchParams.get('missionId');
      if (!idPattern.test(missionId || '')) fail(400, 'Invalid project identifier.');
      const state = await load(cfg);
      for (const job of state.jobs.filter(j => j.input.missionId === missionId && active.has(j.status) && j.providerId && Date.now() - Date.parse(j.createdAt) < pollWindow)) if (cfg.apiKey) watch(cfg, job.id);
      return send(res, 200, { jobs: state.jobs.filter(j => j.input.missionId === missionId).map(publicJob) });
    }
    if (action === 'job' || action === 'video') {
      const id = url.searchParams.get('id');
      if (!idPattern.test(id || '')) fail(400, 'Invalid motion identifier.');
      if (action === 'job') return send(res, 200, await syncJob(cfg, id));
      return await serveVideo(req, res, cfg, id);
    }
    if (action !== 'submit') fail(404, 'Unknown operation.');
    const input = validate(await body(req));
    const result = await locked(cfg, async state => {
      const existing = state.jobs.find(j => j.id === input.id);
      if (existing) {
        const previous = { ...existing.input, mode: existing.input.mode || 'image-to-video', referenceIds: existing.input.referenceIds || [] };
        if (fields.some(key => JSON.stringify(previous[key]) !== JSON.stringify(input[key]))) fail(409, 'Request identifier is already in use.');
        return publicJob(existing);
      }
      if (!cfg.enabled) fail(503, 'Live motion generation is unavailable.');
      if (state.jobs.some(j => active.has(j.status))) fail(409, 'Another motion job is active or needs reconciliation.');
      const rate = pricing[input.mode];
      const referenceCount = input.mode === 'reference-to-video' ? 1 + input.referenceIds.length : 0;
      const estimatedCostUsd = Math.round((rate.estimatedCostPerSecond * input.duration + rate.estimatedCostPerReference * referenceCount) * 1000) / 1000;
      const reservation = Math.round((rate.reservationCostPerSecond * input.duration + rate.estimatedCostPerReference * referenceCount) * 1000) / 1000;
      if (Date.now() - state.lastSubmit < 30000) fail(429, 'Wait 30 seconds between motion submissions.');
      const source = await sourceStill(cfg, input);
      const references = [];
      for (const id of input.referenceIds) references.push(await curatedStill(input, id));
      const providerInput = { image_url: source.imageUrl, prompt: input.direction.trim(), prompt_expansion_mode: 'balanced', duration: input.duration, resolution: '768p', seed: input.seed, enable_safety_checker: true };
      if (input.mode === 'reference-to-video') {
        delete providerInput.image_url;
        providerInput.reference_images = [source.imageUrl, ...references.map(ref => ref.imageUrl)];
        providerInput.aspect_ratio = '16:9';
        providerInput.prompt = `Use the supplied images as visual identity references, not prescribed starting frames. The shot composition and action are described in the brief. Preserve the red-and-gold armor construction, closed helmet and circular chest reactor; no additional gold chest stripes or glowing torso seams. ${input.direction.trim()}`;
      }
      const model = `minimax/minimax-h3-max/${input.mode}`;
      const job = { id: input.id, input, model, source, references, providerInput, estimatedCostUsd, reservationUsd: reservation, status: 'submitting', createdAt: new Date().toISOString() };
      state.jobs.push(job); state.reservedUsd = Math.round((state.reservedUsd + reservation) * 1000) / 1000; state.lastSubmit = Date.now();
      // Persist and flush the reservation before the only paid HTTP call. Any uncertain outcome stays blocked.
      await save(cfg, state);
      try {
        const response = await providerJson(cfg, `${api}/models/${model}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(providerInput) });
        job.providerSubmission = response;
        if (typeof response.request_id !== 'string' || !idPattern.test(response.request_id)) throw new Error('Submission uncertain');
        job.providerId = response.request_id; job.status = 'queued'; job.message = 'Queued for motion generation.';
      } catch (error) {
        if (error instanceof ProviderError && [400, 401, 402, 403, 404, 405, 415, 422, 429].includes(error.status)) {
          job.status = 'failed'; job.providerFailure = { httpStatus: error.status };
          job.message = 'The provider rejected this motion submission. Check the server credential, account allowance and request before creating a new request. The reservation remains counted.';
        } else { job.status = 'unknown'; job.message = 'Submission outcome unknown. Reviewer must reconcile before another run.'; }
      }
      await save(cfg, state);
      if (job.providerId) watch(cfg, job.id);
      return publicJob(job);
    });
    return send(res, 202, result);
  } catch (error) {
    if (res.headersSent) { if (!res.destroyed) res.destroy(); return; }
    return send(res, error instanceof PublicError ? error.status : 503, { message: error instanceof PublicError ? error.message : 'Motion service unavailable. Retry status before submitting again.' });
  }
}
