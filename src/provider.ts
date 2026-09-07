export type Mode = 'reuse' | 'create' | 'adapt';
export type GenerationRequest = { id: string; mode: Mode; identity: string; source: string | null; campaign: string; direction: string; placement: string; createdAt: string };
export type GenerationJob = { request: GenerationRequest; status: 'awaiting-output'; execution: 'prepared'; result: null };
export interface GenerationProvider { submit(request: GenerationRequest): Promise<GenerationJob> }

// Phase 1 never invents a generated result when no matching artifact exists.
export class CachedPrototypeProvider implements GenerationProvider {
  async submit(request: GenerationRequest): Promise<GenerationJob> {
    return { request, status: 'awaiting-output', execution: 'prepared', result: null };
  }
}
export const provider = new CachedPrototypeProvider();
