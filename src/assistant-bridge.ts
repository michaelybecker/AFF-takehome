import { saveWorkspaceValue } from './workspaceSync';
import { useSyncExternalStore } from 'react';
import { initialMissions, missionStorageKey, newMission, type MissionState } from './missions';
import { clipTitle, type CampaignMaster, type Manifest } from './data';
import { stillApi, motionApi, type LiveJob, type LiveStatus, type MotionStatus } from './provider';

let missions = initialMissions();
const explorationKey = 'content-studio-sandbox-v1';
function savedExplorations(): CampaignMaster[] {
  try {
    const saved = JSON.parse(localStorage.getItem(explorationKey) || '[]');
    return Array.isArray(saved) ? saved.filter(a => a && a.prepared === true && typeof a.id === 'string' && typeof a.campaignId === 'string' && typeof a.title === 'string' && ['still', 'motion'].includes(a.kind) && typeof a.src === 'string' && /^\/(media\/|api\/(stills|motion)\?)/.test(a.src)).slice(0, 100) : [];
  } catch { return []; }
}
let assets: CampaignMaster[] = savedExplorations();
const removedKey = 'content-studio-sandbox-removed-v1';
function savedRemovals(): string[] {
  try { const value = JSON.parse(localStorage.getItem(removedKey) || '[]'); return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []; }
  catch { return []; }
}
let removed = new Set<string>(savedRemovals());
function persistRemovals() {
  try { localStorage.setItem(removedKey, JSON.stringify([...removed])); }
  catch { /* The server registry remains durable when browser storage is unavailable. */ }
}
export function projectAssets(manifest: Manifest) {
  return [...assets, ...(manifest.campaignMasters || [])].filter((a, i, all) => !removed.has(a.id) && all.findIndex(b => b.id === a.id) === i);
}
export async function refreshExplorations() {
  const response = await fetch('/api/explorations');
  if (!response.ok) throw new Error('Sandbox registry unavailable.');
  const data = await response.json();
  // A registry response started before deletion must not undo that deletion.
  removed = new Set([...removed, ...data.removed]);
  persistRemovals();
  const ids = new Set(data.assets.map((a: CampaignMaster) => a.id));
  assets = [...data.assets, ...assets.filter(a => !a.blobBacked && !ids.has(a.id))].filter(a => !removed.has(a.id)); emit();
}
const listeners = new Set<() => void>();
export const assistantJobs = new Set<string>();
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
const emit = () => listeners.forEach(fn => fn());
export function setStudioMissions(value: MissionState | ((previous: MissionState) => MissionState)) {
  missions = typeof value === 'function' ? value(missions) : value;
  try { saveWorkspaceValue(missionStorageKey, JSON.stringify(missions)); } catch { /* In-memory workspace remains usable. */ }
  emit();
}
export function setStudioAssets(value: CampaignMaster[] | ((previous: CampaignMaster[]) => CampaignMaster[])) {
  const next = typeof value === 'function' ? value(assets) : value;
  // Polling may refresh a completed job, but must not discard a prepared candidate.
  const saved = assets.filter(asset => asset.prepared);
  assets = [...saved, ...next.filter(asset => !saved.some(item => item.id === asset.id && item.campaignId === asset.campaignId))].filter(a => !removed.has(a.id)); emit();
}
export async function changeSandboxAsset(asset: CampaignMaster, action: 'save' | 'delete') {
  const response = await fetch('/api/explorations', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Content-Studio': '1' }, body: JSON.stringify({ action, id: asset.id, kind: asset.kind }) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'Curation failed.');
  if (action === 'delete') {
    removed.add(asset.id); assets = assets.filter(a => a.id !== asset.id);
    setStudioMissions(previous => ({ ...previous, missions: previous.missions.map(m => ({ ...m, draft: { ...m.draft, stillId: m.draft.stillId === asset.id ? '' : m.draft.stillId, motionId: m.draft.motionId === asset.id ? '' : m.draft.motionId } })) }));
  } else { removed.delete(asset.id); assets = [data.asset, ...assets.filter(a => a.id !== asset.id)]; }
  persistRemovals();
  try { localStorage.setItem(explorationKey, JSON.stringify(savedExplorations().filter(a => a.id !== asset.id))); }
  catch { /* The server has already saved this change. */ }
  emit();
}
export function useStudioMissions() { return [useSyncExternalStore(subscribe, () => missions), setStudioMissions] as const; }
export function useStudioAssets() { return [useSyncExternalStore(subscribe, () => assets), setStudioAssets] as const; }
export type AssistantAction = { id: string; name: string; arguments: Record<string, unknown> };
export type Receipt = { text: string; asset?: CampaignMaster; jobId?: string };
export function studioContext(manifest: Manifest, route: string) {
  const current = missions.missions.find(m => m.id === missions.selectedId)!;
  return { route, identity: { id: 'iron_man_mark_iii', title: 'Iron Man / Mark III', version: manifest.version,
    adaptation: manifest.derived?.adaptation, stillTrainingRuns: manifest.derived?.stillTrainingRuns, constraints: ['Red and gold Mark III armor', 'Circular arc reactor', 'No unapproved redesign'],
    assets: { stills: manifest.stills?.length || 0, clips: manifest.clips.length, canonical: manifest.canon.length },
    canonicalCoverage: { frames: manifest.frames, passes: manifest.passes },
    expression: [
      ...manifest.clips.map(item => ({ id: item.id, title: clipTitle(item), kind: 'motion', duration: item.duration })),
      ...(manifest.stills || []).map(({ id, title, variant, category }) => ({ id, title, variant, category, kind: 'still' })),
    ],
    creativeCanon: manifest.canon.map(({ id, title, variant }) => ({ id, title, variant })),
    sourceCollection: manifest.derived ? {
      ...Object.fromEntries(Object.entries(manifest.derived.dataset).filter(([key]) => !['items', 'download', 'sha256', 'bytes'].includes(key))),
      items: manifest.derived.dataset.items.map(({ id, title, caption }) => ({ id, title, caption })),
    } : null,
    sampleResults: (manifest.derived?.sampleResults || []).map(({ src, poster, prompt, ...metadata }) => metadata),
  },
    currentMission: { ...current, briefs: undefined }, missions: missions.missions.map(m => ({ id: m.id, title: m.title })),
    selectedMasterIds: { still: current.draft.stillId, motion: current.draft.motionId },
    availableAssets: projectAssets(manifest).filter(a => a.campaignId === current.id).map(a => ({ id: a.id, title: a.title, kind: a.kind, src: a.src, poster: a.poster, prepared: a.prepared === true, prompt: a.prompt, reviewNotes: a.reviewNotes, lineage: a.lineage })),
  };
}
export async function capabilities() {
  const [still, motion] = await Promise.allSettled([stillApi<LiveStatus>('status'), motionApi<MotionStatus>('status')]);
  return { still: still.status === 'fulfilled' ? still.value : { available: false, message: 'Still service unavailable' }, motion: motion.status === 'fulfilled' ? motion.value : { available: false, message: 'Motion service unavailable' } };
}
export async function executeAssistantAction(action: AssistantAction, manifest: Manifest, progress: (text: string, job?: LiveJob) => void): Promise<Receipt> {
  const a = action.arguments;
  if (action.name === 'navigate') {
    if (!['identity', 'create', 'animate', 'adapt'].includes(String(a.route))) throw new Error('Unknown workspace view.');
    location.hash = a.route === 'identity' ? '#/identity' : `#/activate/${a.route}`;
    return { text: `Opened ${a.route}.` };
  }
  if (action.name === 'inspect_identity') {
    const sections: Record<string, string> = { overview: 'source', canonical: 'canon', motion: 'expression', expression: 'expression', semantic: 'semantic', derived: 'derived' };
    const section = sections[String(a.section)];
    if (!section) throw new Error('Unknown identity section.');
    location.hash = '#/identity';
    window.setTimeout(() => document.getElementById(section)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
    return { text: `Opened ${a.section}. Iron Man / Mark III. Identity kit ${manifest.version}. ${manifest.stills?.length || 0} production stills, ${manifest.clips.length} clips, ${manifest.canon.length} canonical references. Adaptation: ${manifest.derived?.adaptation.status || 'Unavailable'}. Preserve red and gold armor and circular reactor.` };
  }
  if (action.name === 'create_mission') {
    if (missions.missions.length >= 50) throw new Error('Project limit reached.');
    const next = newMission();
    for (const key of ['title', 'occasion', 'summary', 'audience', 'objective', 'market', 'owner', 'message', 'constraints'] as const) if (typeof a[key] === 'string') next[key] = a[key].slice(0, key === 'constraints' ? 2000 : 500);
    if (!next.title.trim()) throw new Error('A project title is required.');
    setStudioMissions({ ...missions, selectedId: next.id, missions: [...missions.missions, next] });
    return { text: `Created ${next.title}. Project ID: ${next.id}.` };
  }
  const mission = missions.missions.find(m => m.id === a.missionId);
  if (!mission) throw new Error('Project no longer exists. Ask for a refreshed proposal.');
  const patchMission = (next: typeof mission) => setStudioMissions(previous => ({ ...previous, missions: previous.missions.map(m => m.id === next.id ? next : m) }));
  if (action.name === 'update_brief') {
    const fields = a.fields as Record<string, unknown>;
    if (!fields || typeof fields !== 'object') throw new Error('No brief changes supplied.');
    const next = { ...mission, draft: { ...mission.draft } };
    for (const key of ['title', 'occasion', 'summary', 'audience', 'objective', 'market', 'owner', 'message', 'constraints'] as const) if (typeof fields[key] === 'string') next[key] = fields[key].slice(0, key === 'constraints' ? 2000 : 500);
    for (const key of ['stillDirection', 'motionDirection', 'headline', 'supporting', 'cta'] as const) if (typeof fields[key] === 'string') next.draft[key] = fields[key].slice(0, key.endsWith('Direction') ? 1500 : 100);
    if (!next.title.trim()) throw new Error('Project title cannot be empty.');
    if (fields.kind === 'still' || fields.kind === 'motion') next.draft.kind = fields.kind;
    if (fields.fit === 'contain' || fields.fit === 'cover') next.draft.fit = fields.fit;
    if (['A01', 'A02', 'A03', 'A04'].includes(String(fields.placementId))) next.draft.placementId = String(fields.placementId);
    if (typeof fields.graphics === 'boolean') next.draft.graphics = fields.graphics;
    for (const key of ['duration', 'focalX', 'focalY'] as const) if (typeof fields[key] === 'number' && Number.isFinite(fields[key])) next.draft[key] = Math.max(key === 'duration' ? 5 : 0, Math.min(key === 'duration' ? 15 : 100, Math.round(fields[key])));
    patchMission(next); return { text: `Updated brief for ${next.title}.` };
  }
  const allAssets = projectAssets(manifest);
  if (action.name === 'select_master') {
    const master = allAssets.find(m => m.id === a.masterId && m.campaignId === mission.id && m.kind === a.kind);
    if (!master) throw new Error('This master is not available in the project.');
    patchMission({ ...mission, draft: { ...mission.draft, ...(master.kind === 'still' ? { stillId: master.id } : { motionId: master.id }) } });
    return { text: `Selected ${master.title} as ${master.kind} master for ${mission.title}.`, asset: master };
  }
  if (!['generate_still', 'generate_motion'].includes(action.name)) throw new Error('Unsupported assistant action.');
  const motion = action.name === 'generate_motion';
  const api = motion ? motionApi : stillApi;
  let status = await api<MotionStatus>('status');
  if (!status.available) throw new Error(status.message || 'Generation unavailable.');
  if (!status.authorized) {
    if (status.tokenRequired) throw new Error('Authorize the reviewer in Activate, then request generation again.');
    await api('session', { localReviewer: true, token: '' });
    status = await api<MotionStatus>('status');
  }
  if (!status.authorized || status.activeJob) throw new Error('Generation is busy, unauthorized, or another job is active.');
  const direction = typeof a.direction === 'string' ? a.direction.trim() : '';
  if (!direction || direction.length > 1500) throw new Error('A creative direction of 1 to 1500 characters is required.');
  const source = allAssets.find(m => m.id === a.sourceId && m.campaignId === mission.id);
  const curatedSource = status.curatedReferences?.find(r => r.id === a.sourceId);
  const mode = a.mode || 'image-to-video';
  const referenceIds = Array.isArray(a.referenceIds) ? a.referenceIds : [];
  if (motion && !curatedSource && (!source || source.kind !== 'still' || source.lineage?.execution !== 'live' || source.lineage.jobId !== source.id)) throw new Error('Animation requires a generated project still or an available curated reference.');
  if (motion && (mode !== 'image-to-video' || referenceIds.length)) throw new Error('Choose one starting frame for animation.');
  if (motion && (!status.methods?.includes(mode as 'image-to-video' | 'reference-to-video') || referenceIds.length > (status.maxReferenceImages || 12) - 1 || referenceIds.some(id => id === a.sourceId || !status.curatedReferences?.some(r => r.id === id)) || (mode === 'image-to-video' && referenceIds.length))) throw new Error('The motion method or reference selection is unavailable. Request a refreshed proposal.');
  if (motion && (!Number.isInteger(a.duration) || Number(a.duration) < 5 || Number(a.duration) > (status.maxDuration || 15))) throw new Error('Motion duration is outside the available range.');
  const id = crypto.randomUUID(); assistantJobs.add(id);
  const input = { id, missionId: mission.id, missionTitle: mission.title, direction, identityKitVersion: manifest.version, seed: crypto.getRandomValues(new Uint32Array(1))[0] % 2147483648,
    ...(motion ? { sourceId: a.sourceId, duration: a.duration, mode, referenceIds } : { adaptationId: manifest.derived?.adaptation.id }) };
  progress(`Submitting ${motion ? 'motion' : 'still'} for ${mission.title}.`);
  let job: LiveJob;
  try { job = await api<LiveJob>('submit', input); }
  catch (error) {
    const code = (error as { status?: number }).status;
    if (code && [400, 401, 403, 413, 415, 429].includes(code)) { assistantJobs.delete(id); throw error; }
    progress(`Submission uncertain. Checking request ${id}; no duplicate will be submitted.`); job = { id, missionId: mission.id, status: 'unknown', execution: 'live', createdAt: new Date().toISOString(), direction, message: 'Submission uncertain', result: null };
  }
  const deadline = Date.now() + 20 * 60 * 1000;
  while (!['completed', 'failed'].includes(job.status) && Date.now() < deadline) {
    progress(`${job.message || job.status} (Request ${id})`, job);
    await new Promise(resolve => setTimeout(resolve, 5000));
    try { const result = await api<{ jobs: LiveJob[] }>(`jobs&missionId=${encodeURIComponent(mission.id)}`); job = result.jobs.find(j => j.id === id) || job; }
    catch { progress(`Connection interrupted. Still tracking request ${id}.`); }
  }
  progress(job.message || job.status, job);
  if (job.status !== 'completed' || !job.result) throw new Error(`${job.message || 'Result not confirmed'}. Request ${id}. Check Activate before submitting again.`);
  setStudioAssets(previous => [...previous.filter(m => m.id !== job.result!.id), job.result!]);
  return { text: `${motion ? 'Motion' : 'Still'} completed for ${mission.title}. Candidate ${job.result.id}; master selection pending review.`, asset: job.result, jobId: id };
}
