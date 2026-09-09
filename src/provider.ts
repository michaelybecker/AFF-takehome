import type { CampaignMaster } from './data';
import type { Mission } from './missions';
export type Mode = 'create' | 'animate' | 'deliver';
export type GenerationRequest = {
  dimensions?: { width: number; height: number };
  id: string; mode: Mode; identity: string; identityKitVersion: string; adaptationId: string | null;
  source: string | null; campaign: string; campaignId: string; artifactId: string;
  outputKind: 'still' | 'motion'; direction: string; placement: string; aspectRatio: string;
  duration: number | null; copy: { headline: string; supporting: string; cta: string };
  layout: { fit: 'contain' | 'cover'; focalX: number; focalY: number; graphics: boolean } | null;
  createdAt: string;
  mission?: Omit<Mission, 'draft' | 'briefs'> & { draft?: undefined; briefs?: undefined }; sourceLineage?: CampaignMaster['lineage'] | null;
};
export type GenerationJob = { request: GenerationRequest; status: 'awaiting-output'; execution: 'prepared'; result: null };
export interface GenerationProvider { submit(request: GenerationRequest): Promise<GenerationJob> }

// Phase 1 never invents a generated result when no matching artifact exists.
export class CachedPrototypeProvider implements GenerationProvider {
  async submit(request: GenerationRequest): Promise<GenerationJob> {
    return { request, status: 'awaiting-output', execution: 'prepared', result: null };
  }
}
export const provider = new CachedPrototypeProvider();

export type JobDiagnostics = { elapsedSeconds: number; providerStatus: string | null; providerRequestId: string | null; lastCheckedAt: string | null; lastSuccessfulCheckAt: string | null; events: { at: string; status: string; message: string }[] };
export type LiveJob = { diagnostics?: JobDiagnostics; id: string; missionId: string; status: 'submitting' | 'queued' | 'running' | 'receiving' | 'recovering' | 'unknown' | 'failed' | 'completed'; execution: 'live'; createdAt: string; lastCheckedAt?: string | null; reconciliationRequired?: boolean; generationPrompt?: string | null; direction: string; message: string; result: CampaignMaster | null };
export type LiveStatus = { available: boolean; temporary: boolean; authorized: boolean; tokenRequired: boolean; message: string; remainingJobs: number | null; activeJob: boolean; videoAvailable: boolean };
export type MotionMode = 'image-to-video' | 'reference-to-video';
export type MotionReference = { id: string; title: string; group?: string; src: string };
export type MotionRequest = { id: string; missionId: string; missionTitle: string; direction: string; identityKitVersion: string; sourceId: string; seed: number; duration: number; mode?: MotionMode; referenceIds?: string[] };
export type MotionJob = LiveJob & { sourceId: string; mode: MotionMode; referenceIds: string[]; model: string; estimatedCostUsd: number | null; reservationUsd: number };
export type MotionStatus = LiveStatus & { estimatedCostPerSecond: number; resolution: string; maxDuration: number;
  methods: MotionMode[]; curatedReferences: MotionReference[]; maxReferenceImages: number; remainingBudgetUsd: number | null; maxReservationUsd: number | null;
  pricing: Record<MotionMode, { estimatedCostPerSecond: number; estimatedCostPerReference: number; reservationCostPerSecond: number }> };
export async function stillApi<T>(action: string, payload?: unknown): Promise<T> {
  const response = await fetch(`/api/stills?action=${action}`, { method: payload === undefined ? 'GET' : 'POST', credentials: 'same-origin',
    headers: payload === undefined ? {} : { 'Content-Type': 'application/json', 'X-Content-Studio': '1' },
    body: payload === undefined ? undefined : JSON.stringify(payload), signal: AbortSignal.timeout(55000) });
  let result;
  try { result = await response.json(); } catch { throw new Error('Live still service is unavailable on this host.'); }
  if (!response.ok) throw Object.assign(new Error(typeof result.message === 'string' ? result.message : 'Still request failed.'), { status: response.status });
  return result as T;
}
export async function motionApi<T>(action: string, payload?: unknown): Promise<T> {
  const response = await fetch(`/api/motion?action=${action}`, { method: payload === undefined ? 'GET' : 'POST', credentials: 'same-origin',
    headers: payload === undefined ? {} : { 'Content-Type': 'application/json', 'X-Content-Studio': '1' },
    body: payload === undefined ? undefined : JSON.stringify(payload), signal: AbortSignal.timeout(55000) });
  let result;
  try { result = await response.json(); } catch { throw new Error('Live motion service is unavailable on this host.'); }
  if (!response.ok) throw Object.assign(new Error(typeof result.message === 'string' ? result.message : 'Motion request failed.'), { status: response.status });
  return result as T;
}
