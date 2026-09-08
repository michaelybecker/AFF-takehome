import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, open, unlink } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { diagnostics, recordDiagnostics, recoveryReason } from './job-diagnostics.mjs';

const adaptationId = 'mark-iii-krea-identity-v0.2';
const kreaLora = 'https://trainers-storage.runcomfy.net/trainers/kQUxbMfkCXG9yxpb/imk3gik_krea2_raw_v02_000001500.safetensors';
const lora = 'https://files.runcomfy.net/train/users/a4fb40b4-fdd4-48eb-a6f5-b3ac15143656/ai-toolkit/output/imk3gik_klein4b_v01/imk3gik_klein4b_v01_000000750.safetensors';
const active = new Set(['submitting', 'queued', 'running', 'receiving', 'recovering', 'unknown']);
const idPattern = /^[a-zA-Z0-9-]{1,80}$/;
const localSessionKey = randomUUID() + randomUUID();
const workers = new Set();
const limits = { intervalMs: 30000, width: 1280, height: 720 };
const generationSettings = { steps: 8, guidance: 1, scale: 1, sampler: 'flowmatch' };
class PublicError extends Error { constructor(status, message) { super(message); this.status = status; } }
const fail = (status, message) => { throw new PublicError(status, message); };
const send = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(body)); };
const equal = (a, b) => { const x = Buffer.from(a); const y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };
function config(env, local) {
  let endpoint;
  try {
    const url = new URL(env.RUNCOMFY_COMFY_URL);
    if (url.protocol === 'https:' && /^[a-z0-9-]+-comfyui\.runcomfy\.com$/.test(url.hostname) && url.pathname === '/' && !url.search && !url.username && !url.password) endpoint = url.origin;
  } catch { /* No endpoint means unavailable, never a replacement provider. */ }
  const backend = env.CONTENT_STUDIO_STILL_BACKEND || 'krea';
  const deploymentId = /^[0-9a-f-]{36}$/.test(env.RUNCOMFY_DEPLOYMENT_ID || '') ? env.RUNCOMFY_DEPLOYMENT_ID : '';
  const apiKey = env.RUNCOMFY_API_KEY?.trim();
  const expiresAt = backend !== 'comfy' ? Infinity : Date.parse(env.RUNCOMFY_COMFY_EXPIRES_AT || '');
  const reserve = 0;
  return { endpoint, backend, deploymentId, apiKey, expiresAt, local, root: path.resolve(env.CONTENT_STUDIO_DATA_DIR || '.local-data/stills'),
    secret: env.CONTENT_STUDIO_REVIEWER_TOKEN || (local ? localSessionKey : ''),
    enabled: local && env.CONTENT_STUDIO_LIVE_ENABLED === 'true' && (backend === 'krea' ? !!apiKey : backend === 'serverless' ? !!deploymentId && !!apiKey : backend === 'comfy' && !!endpoint && Number.isFinite(expiresAt) && Date.now() < expiresAt),
    reserve };
}
function originAllowed(req, local) {
  const host = req.headers.host || '';
  const origin = req.headers.origin;
  if (local) {
    const address = req.socket?.remoteAddress;
    return /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address)
      && (!origin || origin === `http://${host}`) && !['cross-site', 'same-site'].includes(req.headers['sec-fetch-site']);
  }
  return false;
}
function authorized(req, cfg) {
  const cookie = (req.headers.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith('cs_reviewer='))?.slice(12) || '';
  const [expiry, signature] = cookie.split('.');
  return cfg.secret && Number(expiry) > Date.now() && Number(expiry) < Date.now() + 9 * 3600000
    && equal(signature || '', createHmac('sha256', cfg.secret).update(expiry || '').digest('hex'));
}
async function body(req) {
  if (!(req.headers['content-type'] || '').startsWith('application/json')) fail(415, 'JSON request required.');
  if (Number(req.headers['content-length']) > 8192) fail(413, 'Request too large.');
  if (req.body !== undefined) {
    if (Buffer.byteLength(JSON.stringify(req.body)) > 8192) fail(413, 'Request too large.');
    return req.body;
  }
  const chunks = []; let size = 0;
  for await (const chunk of req) { const bytes = Buffer.from(chunk); size += bytes.length; if (size > 8192) fail(413, 'Request too large.'); chunks.push(bytes); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { fail(400, 'Invalid request.'); }
}
function validate(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail(400, 'Invalid still request.');
  const allowed = ['id', 'missionId', 'missionTitle', 'direction', 'identityKitVersion', 'adaptationId', 'seed'];
  if (Object.keys(input).some(k => !allowed.includes(k))) fail(400, 'Unsupported generation setting.');
  for (const key of ['id', 'missionId']) if (typeof input[key] !== 'string' || !idPattern.test(input[key])) fail(400, 'Invalid project or request identifier.');
  for (const [key, max] of [['missionTitle', 500], ['direction', 1500], ['identityKitVersion', 30]]) {
    if (typeof input[key] !== 'string' || !input[key].trim() || input[key].length > max || /[\u0000-\u0008]/.test(input[key])) fail(400, 'Incomplete or oversized creative brief.');
  }
  if (input.adaptationId !== adaptationId) fail(400, 'The registered still adaptation is required.');
  if (!Number.isInteger(input.seed) || input.seed < 0 || input.seed > 2147483647) fail(400, 'Seed is out of range.');
  return input;
}
async function load(cfg) {
  try { return JSON.parse(await readFile(path.join(cfg.root, 'jobs.json'), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return { jobs: [], reservedUsd: 0, lastSubmit: 0 }; throw error; }
}
async function save(cfg, state) {
  state.jobs.forEach(recordDiagnostics);
  const temporary = path.join(cfg.root, `${randomUUID()}.tmp`);
  await writeFile(temporary, JSON.stringify(state), { mode: 0o600 });
  await rename(temporary, path.join(cfg.root, 'jobs.json'));
}
async function locked(cfg, operation) {
  await mkdir(cfg.root, { recursive: true });
  let lock;
  try { lock = await open(path.join(cfg.root, 'jobs.lock'), 'wx'); }
  catch (error) { if (error.code === 'EEXIST') fail(429, 'Generation state is busy. Try again shortly.'); throw error; }
  try { return await operation(await load(cfg)); }
  finally { await lock.close(); await unlink(path.join(cfg.root, 'jobs.lock')); }
}
async function upstream(cfg, route, options = {}) {
  if (!cfg.endpoint || Date.now() >= cfg.expiresAt) fail(503, 'Live still generation is unavailable. The temporary session has ended.');
  const response = await fetch(`${cfg.endpoint}${route}`, { ...options, signal: AbortSignal.timeout(20000), redirect: 'error' });
  if (!response.ok) { await response.body?.cancel(); fail(502, 'The generation service could not complete this request.'); }
  return response;
}
async function serverless(cfg, route, options = {}) {
  const response = await fetch(`https://api.runcomfy.net/prod/v2/deployments/${cfg.deploymentId}${route}`, {
    ...options, headers: { ...options.headers, Authorization: `Bearer ${cfg.apiKey}` }, signal: AbortSignal.timeout(20000), redirect: 'error',
  });
  if (!response.ok) { await response.body?.cancel(); throw Object.assign(new PublicError(502, 'The generation service could not complete this request.'), { providerHttpStatus: response.status }); }
  return response.json();
}
async function models(cfg, route, options = {}) {
  const response = await fetch('https://model-api.runcomfy.net/v1' + route, {
    ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
    signal: AbortSignal.timeout(20000), redirect: 'error',
  });
  if (!response.ok) { await response.body?.cancel(); throw Object.assign(new Error('Model service unavailable'), { providerHttpStatus: response.status }); }
  return response.json();
}
async function capabilityAvailable(cfg) {
  if (cfg.backend === 'krea') { await models(cfg, '/models/runcomfy/krea2-turbo'); return true; }
  if (cfg.backend === 'serverless') {
    const deployment = await serverless(cfg, '');
    return deployment.id === cfg.deploymentId && deployment.is_enabled === true;
  }
  const schema = await (await upstream(cfg, '/object_info')).json();
  return !!schema.RCFlux2Klein4B && !!schema.SaveImage;
}
async function outputResponse(cfg, output) {
  if (cfg.backend !== 'comfy') {
    const url = new URL(output.url);
    if (url.protocol !== 'https:' || (url.port && url.port !== '443') || !['serverless-api-storage.runcomfy.net', 'files.runcomfy.net', 'playgrounds-storage-public.runcomfy.net'].includes(url.hostname) || url.username || url.password) throw new Error('Unexpected output host');
    const response = await fetch(url, { signal: AbortSignal.timeout(20000), redirect: 'error' });
    if (!response.ok) { await response.body?.cancel(); throw new Error('Output unavailable'); }
    return response;
  }
  const query = new URLSearchParams({ filename: output.filename, subfolder: output.subfolder || '', type: 'output' });
  return upstream(cfg, `/view?${query}`);
}
export function buildStillPrompt(direction) {
  // Neutralize the old demo's positive typography cue without changing its saved campaign brief.
  const clean = direction.trim().replace(/^IMK3GIK[.\s]+/i, '')
    .replace(/^Commemorative Mark III armor portrait/, 'Mark III armor portrait')
    .replace('Compose in 16:9 with space for separate anniversary typography.', 'Compose in 16:9 with open negative space.');
  return `IMK3GIK. ${clean} Clean photographic image only, without lettering, captions, logos or watermarks.`;
}
async function startupDetail(progress, job) {
  if (Date.now() - (job.logCheckedAt || 0) < 15000) return job.phaseMessage;
  job.logCheckedAt = Date.now();
  try {
    const url = new URL(progress.log_url);
    if (url.origin !== 'https://cdn.runcomfy.com' || !/^\/logs\/[a-zA-Z0-9-]+\/comfyui\.txt$/.test(url.pathname)) return job.phaseMessage;
    const response = await fetch(url, { signal: AbortSignal.timeout(4000), redirect: 'error' });
    if (!response.ok) { await response.body?.cancel(); return job.phaseMessage; }
    const reader = response.body.getReader();
    let size = 0, tail = '';
    const decoder = new TextDecoder();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 512 * 1024) return job.phaseMessage;
        tail = (tail + decoder.decode(value, { stream: true })).slice(-24000);
      }
    } finally { await reader.cancel(); }
    // Expose only recognized stages, never raw provider logs or private URLs.
    const totalSteps = job.settings?.steps ?? 30;
    const steps = [...tail.matchAll(/(\d+)\s*\/\s*(\d+)\s*\[/g)].filter(match => Number(match[2]) === totalSteps).at(-1);
    if (steps) return `Rendering still: ${Math.min(totalSteps, Number(steps[1]))} of ${totalSteps} steps reported.`;
    if (/Loading pipeline|Loading FLUX|Loading checkpoint shards|Loading pipeline components/i.test(tail)) return 'Loading image model and identity adaptation onto the GPU.';
    if (/Downloading LoRA/i.test(tail)) return 'Downloading the identity adaptation.';
    if (/got prompt/i.test(tail)) return 'Workflow accepted. Preparing model and identity adaptation.';
    if (/ComfyUI|Starting server|Checkpoint files/i.test(tail)) return 'Starting ComfyUI and loading workflow components (cold start).';
  } catch { /* Optional diagnostics must not prevent job reconciliation. */ }
  return job.phaseMessage;
}
export function publicJob(job) {
  return { id: job.id, diagnostics: diagnostics(job), missionId: job.input.missionId, status: job.status, execution: 'live', createdAt: job.createdAt,
    lastCheckedAt: job.lastCheckedAt || null, generationPrompt: job.generationPrompt || null,
    direction: job.input.direction, message: active.has(job.status) ? `${job.message || 'Waiting for provider.'} Elapsed ${Math.floor((Date.now() - Date.parse(job.createdAt)) / 60000)}m ${Math.floor((Date.now() - Date.parse(job.createdAt)) / 1000) % 60}s. ${job.lastCheckedAt ? `Provider checked at ${job.lastCheckedAt.slice(11, 19)} UTC.` : 'Awaiting first provider update.'}` : job.message || '', result: job.status === 'completed' ? {
      id: job.id, campaignId: job.input.missionId, title: `${job.input.missionTitle} / Still ${job.input.seed}`, kind: 'still',
      prompt: job.input.direction,
      src: `/api/stills?action=image&id=${job.id}`, width: limits.width, height: limits.height,
      lineage: { jobId: job.id, identityKitVersion: job.input.identityKitVersion, adaptationId: job.input.adaptationId, checkpoint: job.backend === 'krea' ? 1500 : 750,
        model: job.backend === 'krea' ? 'Krea 2 Turbo' : 'FLUX.2 Klein Base 4B', seed: job.input.seed, steps: job.settings?.steps ?? 30, scale: job.settings?.scale ?? 1, guidance: job.settings?.guidance ?? 4, sha256: job.sha256, review: 'pending', execution: 'live' },
    } : null };
}
async function syncJob(cfg, id) {
  return locked(cfg, async state => {
    const job = state.jobs.find(j => j.id === id);
    if (!job) fail(404, 'Generation not found.');
    if (!active.has(job.status)) return publicJob(job);
    if (!job.providerId) { job.status = 'unknown'; job.message = 'Submission outcome unknown. Reviewer must reconcile before another run.'; await save(cfg, state); return publicJob(job); }
    job.lastCheckedAt = new Date().toISOString();
    try {
      cfg = { ...cfg, backend: job.backend, deploymentId: job.deploymentId };
      let record;
      let providerStatus;
      if (cfg.backend === 'krea') {
        const route = '/requests/' + encodeURIComponent(job.providerId);
        const progress = await models(cfg, route + '/status');
        providerStatus = progress.status;
        job.providerStatus = providerStatus;
        job.lastSuccessfulCheckAt = new Date().toISOString();
        if (['completed', 'succeeded'].includes(providerStatus)) {
          const result = await models(cfg, route + '/result?include_cost=true');
          const imageUrl = result.output?.images?.[0];
          if (typeof imageUrl !== 'string') throw new Error('Missing image result');
          record = { outputs: { '2': { images: [{ type: 'output', filename: 'image', url: imageUrl }] } } };
        } else if (Date.now() - Date.parse(job.createdAt) > 10 * 60000 && !['failed', 'cancelled'].includes(providerStatus)) {
          await models(cfg, route + '/cancel', { method: 'POST' });
          job.phaseMessage = 'Time limit reached. Waiting for cancellation confirmation.';
        }
      } else if (cfg.backend === 'serverless') {
        const progress = await serverless(cfg, `/requests/${encodeURIComponent(job.providerId)}/status`);
        providerStatus = progress.status;
        job.providerStatus = providerStatus;
        job.lastSuccessfulCheckAt = new Date().toISOString();
        if (providerStatus === 'in_progress') job.phaseMessage = await startupDetail(progress, job);
        job.lastCheckedAt = new Date().toISOString();
        if (['failed', 'cancelled'].includes(providerStatus)) record = { status: providerStatus };
        else if (['completed', 'succeeded'].includes(providerStatus)) record = await serverless(cfg, `/requests/${encodeURIComponent(job.providerId)}/result`);
        else if (Date.now() - Date.parse(job.createdAt) > 10 * 60000) {
          const cancelled = await serverless(cfg, `/requests/${encodeURIComponent(job.providerId)}/cancel`, { method: 'POST' });
          if (cancelled.outcome === 'cancelled') record = { status: 'cancelled' };
          else { job.message = 'Generation time allowance reached. Cancellation needs confirmation.'; }
        }
      } else {
        const history = await (await upstream(cfg, `/history/${encodeURIComponent(job.providerId)}`)).json();
        record = history[job.providerId];
        job.lastCheckedAt = new Date().toISOString();
      }
      if (record?.status?.status_str === 'error' || ['failed', 'cancelled'].includes(record?.status) || ['failed', 'cancelled'].includes(providerStatus)) { job.status = 'failed'; job.message = 'Generation failed or was cancelled. No master was selected.'; }
      else if (record?.outputs?.['2']?.images?.length) {
        const output = record.outputs['2'].images[0];
        if (output.type !== 'output' || typeof output.filename !== 'string') throw new Error('Unexpected image');
        job.status = 'receiving'; job.message = 'Generation finished. Receiving and checking the image.';
        await save(cfg, state);
        const response = await outputResponse(cfg, output);
        const chunks = []; let size = 0;
        for await (const chunk of response.body) { size += chunk.length; if (size > 20 * 1024 * 1024) throw new Error('Oversized output'); chunks.push(chunk); }
        let bytes = Buffer.concat(chunks);
        if (cfg.backend === 'krea') {
          const image = sharp(bytes, { limitInputPixels: 40 * 1024 * 1024, failOn: 'warning' });
          const metadata = await image.metadata();
          if (metadata.width !== limits.width || metadata.height !== limits.height || !['jpeg', 'png', 'webp'].includes(metadata.format)) throw new Error('Invalid Krea image');
          job.nativeSha256 = createHash('sha256').update(bytes).digest('hex');
          bytes = await image.png().toBuffer();
        }
        if (bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || bytes.readUInt32BE(16) !== limits.width || bytes.readUInt32BE(20) !== limits.height) throw new Error('Invalid output');
        // Only a fully copied, checked image may become a browser-visible result.
        await writeFile(path.join(cfg.root, `${job.id}.png`), bytes, { mode: 0o600 });
        job.sha256 = createHash('sha256').update(bytes).digest('hex'); job.status = 'completed'; job.message = 'Generated draft. Creative review required.';
      } else {
        const queue = cfg.backend === 'comfy' ? await (await upstream(cfg, '/queue')).json() : null;
        const running = cfg.backend !== 'comfy' ? providerStatus === 'in_progress' : (queue.queue_running || []).some(item => item[1] === job.providerId);
        const pending = cfg.backend !== 'comfy' ? providerStatus === 'in_queue' : (queue.queue_pending || []).some(item => item[1] === job.providerId);
        job.status = running ? 'running' : pending ? 'queued' : 'recovering';
        job.message = running ? (job.phaseMessage || 'Worker assigned. Starting GPU/workflow or generating; detailed progress not yet reported.') : pending ? 'Waiting for a GPU worker. A cold start may take a few minutes.' : 'Awaiting result confirmation. New runs are blocked.';
      }
    } catch (error) {
      job.status = 'recovering'; job.message = `${recoveryReason(error)} Result recovery pending; new runs are blocked. No duplicate will be submitted.`;
    }
    await save(cfg, state); return publicJob(job);
  });
}
function watch(cfg, id) {
  if (workers.has(id)) return;
  workers.add(id);
  const timer = setInterval(async () => {
    try {
      const job = await syncJob(cfg, id);
      if (!active.has(job.status) || Date.now() > cfg.expiresAt + 60000 || Date.now() - Date.parse(job.createdAt) > 30 * 60000) { clearInterval(timer); workers.delete(id); }
    } catch { /* Polling is retried; provider errors never enter logs or responses. */ }
  }, 5000);
  timer.unref();
}
export async function handleStills(req, res, { local = false, env = process.env } = {}) {
  const cfg = config(env, local);
  try {
    const url = new URL(req.url, 'http://localhost');
    const action = url.searchParams.get('action') || 'status';
    if (!local) return send(res, 503, { message: 'Hosted live generation is unavailable. Durable job storage and distributed limits are not configured.' });
    if (!originAllowed(req, local)) fail(403, 'Reviewer access is required from the local application.');
    const method = ['session', 'submit', 'logout'].includes(action) ? 'POST' : 'GET';
    if (req.method !== method) { res.setHeader('Allow', method); fail(405, 'Method not allowed.'); }
    if (method === 'POST' && req.headers['x-content-studio'] !== '1') fail(403, 'Reviewer request verification failed.');
    if (action === 'session') {
      const input = await body(req);
      if (env.CONTENT_STUDIO_REVIEWER_TOKEN && !equal(String(input?.token || ''), env.CONTENT_STUDIO_REVIEWER_TOKEN)) fail(403, 'Reviewer credential was not accepted.');
      if (!env.CONTENT_STUDIO_REVIEWER_TOKEN && input?.localReviewer !== true) fail(403, 'Local reviewer authorization is required.');
      const expiry = String(Date.now() + 8 * 3600000);
      const signature = createHmac('sha256', cfg.secret).update(expiry).digest('hex');
      res.setHeader('Set-Cookie', `cs_reviewer=${expiry}.${signature}; HttpOnly; SameSite=Strict; Path=/api/stills; Max-Age=28800`);
      return send(res, 200, { authorized: true });
    }
    if (action === 'logout') { res.setHeader('Set-Cookie', 'cs_reviewer=; HttpOnly; SameSite=Strict; Path=/api/stills; Max-Age=0'); return send(res, 200, { authorized: false }); }
    if (action === 'status') {
      const auth = !!authorized(req, cfg);
      let available = false;
      if (cfg.enabled) {
        try { available = await capabilityAvailable(cfg); } catch { /* Health must reflect the running service. */ }
      }
      const state = await load(cfg);
      for (const job of state.jobs.filter(j => active.has(j.status) && j.providerId)) watch(cfg, job.id);
      return send(res, 200, { available, temporary: cfg.backend === 'comfy', authorized: auth, tokenRequired: !!env.CONTENT_STUDIO_REVIEWER_TOKEN,
        message: available ? 'Live stills available for review.' : 'Live stills unavailable. Prepared briefs and saved assets remain available.',
        remainingJobs: null, allowanceLimited: false,
        activeJob: state.jobs.some(j => active.has(j.status)), videoAvailable: false });
    }
    if (!authorized(req, cfg)) fail(401, 'Reviewer authorization required.');
    if (action === 'jobs') {
      const missionId = url.searchParams.get('missionId');
      if (!idPattern.test(missionId || '')) fail(400, 'Invalid project identifier.');
      const state = await load(cfg);
      return send(res, 200, { jobs: state.jobs.filter(j => j.input.missionId === missionId).map(publicJob) });
    }
    if (action === 'job' || action === 'image') {
      const id = url.searchParams.get('id');
      if (!idPattern.test(id || '')) fail(400, 'Invalid generation identifier.');
      if (action === 'job') return send(res, 200, await syncJob(cfg, id));
      const state = await load(cfg);
      if (!state.jobs.some(j => j.id === id && j.status === 'completed')) fail(404, 'Saved result not found.');
      const bytes = await readFile(path.join(cfg.root, `${id}.png`));
      res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': bytes.length, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }); return res.end(bytes);
    }
    if (action !== 'submit') fail(404, 'Unknown operation.');
    const input = validate(await body(req));
    const manifest = JSON.parse(await readFile(new URL('../public/media/manifest.json', import.meta.url), 'utf8'));
    if (input.identityKitVersion !== manifest.version || manifest.derived?.adaptation.id !== adaptationId || manifest.derived?.adaptation.selectedCheckpoint !== 1500
      || manifest.derived?.adaptation.baseModel !== 'Krea 2 RAW') fail(409, 'Refresh the registered identity kit before generating.');
    const result = await locked(cfg, async state => {
      const existing = state.jobs.find(j => j.id === input.id);
      if (existing) {
        if (JSON.stringify(existing.input) !== JSON.stringify(input)) fail(409, 'Request identifier is already in use.');
        return publicJob(existing);
      }
      if (!cfg.enabled || cfg.backend !== 'krea') fail(503, 'Configure the Krea still backend before generating.');
      if (state.jobs.some(j => active.has(j.status))) fail(409, 'Another still is active or needs reconciliation.');
      if (Date.now() - state.lastSubmit < limits.intervalMs) fail(429, 'Wait 30 seconds between submissions.');
      if (!await capabilityAvailable(cfg)) fail(503, 'The registered still capability is unavailable.');
      const job = { id: input.id, input, settings: { ...generationSettings }, generationPrompt: /^IMK3GIK\b/i.test(input.direction.trim()) ? input.direction.trim() : `IMK3GIK armor, ${input.direction.trim()}`, backend: cfg.backend, deploymentId: cfg.deploymentId, status: 'submitting', createdAt: new Date().toISOString() };
      job.lora = { path: kreaLora, checkpoint: 1500, trainingModel: 'Krea 2 RAW' };
      state.jobs.push(job); state.reservedUsd += cfg.reserve; state.lastSubmit = Date.now();
      await save(cfg, state);
      try {
        const prompt = {
          '1': { class_type: 'RCFlux2Klein4B', inputs: { prompt: job.generationPrompt, negative_prompt: '', width: limits.width, height: limits.height,
            sample_steps: job.settings.steps, guidance_scale: job.settings.guidance, seed: input.seed, offload_mode: 'model', lora_path: lora, lora_scale: job.settings.scale, hf_token: '' } },
          '2': { class_type: 'SaveImage', inputs: { filename_prefix: `${input.missionId}/${input.id}`, images: ['1', 0] } },
        };
        const response = cfg.backend === 'krea'
          ? await models(cfg, '/models/runcomfy/krea2-turbo', { method: 'POST', body: JSON.stringify({
            prompt: job.generationPrompt, loras: [{ path: kreaLora, network_multiplier: job.settings.scale }],
            width: limits.width, height: limits.height, sample_steps: job.settings.steps, guidance_scale: job.settings.guidance,
            sampler: job.settings.sampler, seed: input.seed, neg: '', num_frames: 1, fps: 1,
          }) })
          : cfg.backend === 'serverless'
          ? await serverless(cfg, '/inference', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workflow_api_json: prompt }) })
          : await (await upstream(cfg, '/prompt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, client_id: input.id }) })).json();
        const providerId = cfg.backend !== 'comfy' ? response.request_id : response.prompt_id;
        if (typeof providerId !== 'string' || Object.keys(response.node_errors || {}).length) throw new Error('Submission uncertain');
        job.providerId = providerId; job.status = 'queued'; job.message = 'Queued for generation.';
      } catch { job.status = 'unknown'; job.message = 'Submission outcome unknown. Reviewer must reconcile before another run.'; }
      await save(cfg, state);
      if (job.providerId) watch(cfg, job.id);
      return publicJob(job);
    });
    return send(res, 202, result);
  } catch (error) { return send(res, error instanceof PublicError ? error.status : 503, { message: error instanceof PublicError ? error.message : 'Still service unavailable. Retry status before submitting again.' }); }
}
