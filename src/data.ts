export type Clip = { id: string; title: string; src: string; poster: string; duration: number; width: number; height: number };
export type Canon = { id: string; title: string; src: string; variant: string; original: string };
export type Still = { id: string; title: string; src: string; variant: string; category: 'hero' | 'reference'; width: number; height: number };
export type DatasetItem = { id: string; title: string; filename: string; caption: string; width: number; height: number; src: string; variant: string };
export type TrainingDatasetItem = { id: string; title: string; kind: 'still' | 'motion'; split: 'train' | 'holdout'; src: string; poster?: string; duration?: number; width: number; height: number; caption: string; sourceStartSeconds?: number; sourceEndSeconds?: number };
export type TrainingDataset = { id: string; name: string; version: string; model: string; status: string; capturedAt: string; lastCheckedAt?: string; jobId?: string; jobName?: string; progress?: { current_step: number; total_steps: number; percent: number }; videoCount: number; imageCount: number; holdoutCount: number; download: string; bytes: number; notes: string; sourceUrl: string; items: TrainingDatasetItem[] };
export type DerivedIdentityRecord = {
  trainingDatasets?: TrainingDataset[];
  sampleResults?: { id: string; title: string; src: string; variant: string; kind?: 'motion'; poster?: string; duration?: number; sourceStillId?: string; reviewNotes?: string; width: number; height: number; prompt: string; seed: number; checkpoint: number; scale: number; generatedAt: string; method?: string; referenceCount?: number; selectedForShowcase?: boolean }[];
  dataset: { id: string; name: string; version: string; sourceKitVersion: string; capturedAt: string; fingerprint: string; imageCount: number; captionCount: number; trigger: string; scope: string; portability: string; holdouts: string; download: string; bytes: number; sha256: string; items: DatasetItem[] };
  stillTrainingRuns?: { id: string; name: string; role: string; checkpoint: number; details: string }[];
  adaptation: { id: string; name: string; version: string; initiatedOn: string; status: string; statusSource: string; baseModel: string; trainer: string; jobName: string; modality: string; weightsStatus: string; selectedCheckpoint?: number; datasetStatus: string; evaluationStatus: string };
};
export type CampaignMaster = {
  id: string; campaignId: string; title: string; kind: 'still' | 'motion'; src: string;
  poster?: string; width: number; height: number; duration?: number;
  prepared?: boolean; blobBacked?: boolean; prompt?: string; reviewNotes?: string;
  lineage?: { jobId?: string; parentId?: string; sourceStillId?: string; identityKitVersion?: string; adaptationId?: string; checkpoint?: number; model?: string; seed?: number; steps?: number; sha256?: string; review?: string; execution?: string;
    method?: string; generatedAt?: string; scale?: number; guidance?: number; sampleId?: string; mode?: 'image-to-video' | 'reference-to-video'; referenceIds?: string[]; referenceCount?: number; motionLoadsLoRA?: boolean;
    references?: { id: string; sha256: string; sourceLoRA: { adaptationId: string; checkpoint: number; strength?: number; model: string; seed: number; contribution: string; loadedByMotionModel: boolean } }[] };
};
export type Manifest = { version: string; clips: Clip[]; stills?: Still[]; canon: Canon[]; derived?: DerivedIdentityRecord; campaignMasters?: CampaignMaster[]; passes: string[]; frames: number };
export type Pass = 'beauty' | 'matte' | 'depth' | 'normals';
export const passes: Pass[] = ['beauty', 'matte', 'depth', 'normals'];
export const passNames = { beauty: 'Beauty', matte: 'Matte', depth: 'Depth', normals: 'Surface normals' };
export const frameSrc = (pass: Pass, frame: number) => `/media/passes/${pass}/${String(frame + 1).padStart(4, '0')}.webp`;
export const clock = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
export const clipTitle = (clip: Clip) => ({ Hero0: 'Hero performance 00', Hero1: 'Hero performance 01', Hero2: 'Hero performance 02', Hero3: 'Hero performance 03', Hero4: 'Hero performance 04', 'V1-0003_true00002899': 'Production observation' }[clip.id] || clip.title);
export const sectionLinks = [{ id: 'source', label: 'Authoritative asset representation', count: '01' }, { id: 'expression', label: 'Approved Expression', count: '02' }, { id: 'canon', label: 'Creative Canon', count: '03' }, { id: 'semantic', label: 'Semantic Canon', count: '04' }, { id: 'derived', label: 'Generative Identity', count: '05' }];
