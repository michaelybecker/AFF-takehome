import PaginatedGallery from './PaginatedGallery';
import { useEffect } from 'react';
import { Film, RefreshCw } from 'lucide-react';
import type { CampaignMaster, Manifest } from './data';
import type { Mission } from './missions';
import { motionApi, type MotionStatus } from './provider';
import { isWorkingJob, useLiveGeneration } from './useLiveGeneration';
import GenerationProgress from './GenerationProgress';
import { animationSources } from './animationSources';

export default function LiveMotion({ mission, manifest, visible, visitJobs, assets, onSource, onDuration, onResults }: {
  mission: Mission; manifest: Manifest; visible: boolean; visitJobs: Set<string>; assets: CampaignMaster[];
  onSource: (source: { id: string; title: string; src: string } | undefined) => void;
  onDuration: (seconds: number) => void; onResults: (masters: CampaignMaster[]) => void;
}) {
  const live = useLiveGeneration<MotionStatus>({ api: motionApi, missionId: mission.id, requestKey: `content-studio-motion-request-${mission.id}`, visitJobs, selectedId: mission.draft.motionId, onResults });
  const { status, activeJob, submittingAt } = live;
  const working = activeJob && isWorkingJob(activeJob);
  const references = animationSources(assets, status?.curatedReferences || []);
  const sourceId = mission.draft.animationSourceId || '';
  const selectedAsset = assets.find(asset => asset.id === sourceId);
  const source = references.find(ref => ref.id === sourceId || (selectedAsset && ref.src === selectedAsset.src));
  const validSource = !!source && status?.methods?.includes('image-to-video');
  useEffect(() => { onSource(source); }, [source?.id, source?.src, source?.title]);
  const maxDuration = status?.maxDuration || 15;
  const duration = mission.draft.duration;
  const validDuration = Number.isInteger(duration) && duration >= 5 && duration <= maxDuration;
  if (!visible) return null;
  return <div className="live-generation">
    <div className="campaign-section-title"><h3>{visible ? 'Animate still' : 'Saved motion access'}</h3><button className="icon-button" disabled={live.checking} title="Refresh motion status" aria-label="Refresh motion status" onClick={() => void live.refresh()}><RefreshCw size={15} /></button></div>
    {visible && <><span className="status amber">{status?.available ? 'LIVE / Motion available' : 'LIVE motion unavailable'}</span>
      <fieldset className="assistant-motion-fields" disabled={!!activeJob || submittingAt !== null}><legend>Starting frame</legend><PaginatedGallery className="assistant-reference-picker" label="Starting frames" scope={mission.id}>{references.map(ref => <label className="assistant-reference" key={ref.id} title={ref.title}><input type="radio" name={`animation-source-${mission.id}`} aria-label={ref.title} checked={sourceId === ref.id} onChange={() => onSource(ref)} /><img src={ref.src} alt="" /><span>{ref.title}<small>{ref.group}</small></span></label>)}</PaginatedGallery></fieldset>
      {!validSource && <p className="save-notice">Choose a starting frame.</p>}
      <label className="field">Duration (seconds)<input type="number" min={5} max={maxDuration} step={1} disabled={!!activeJob || submittingAt !== null} value={duration} onChange={e => onDuration(Math.min(maxDuration, Math.max(5, Math.round(Number(e.target.value) || 5))))} /></label>
    </>}
    {visible && <button className="button primary full" disabled={!validSource || !validDuration || submittingAt !== null || !!activeJob || !status?.available || !status.authorized || status.activeJob || !!live.checkError || !mission.draft.motionDirection.trim()} onClick={() => void live.submit(() => ({ id: crypto.randomUUID(), missionId: mission.id, missionTitle: mission.title, direction: mission.draft.motionDirection.trim(), identityKitVersion: manifest.version, sourceId, mode: 'image-to-video', referenceIds: [], seed: crypto.getRandomValues(new Uint32Array(1))[0] % 2147483648, duration }))}>{submittingAt !== null || working ? <span className="spinner" /> : <Film size={16} />}{submittingAt !== null ? 'Submitting request' : activeJob ? working ? 'Animation in progress' : 'Awaiting confirmation' : 'Generate animation'}</button>}
    <p className="save-notice" role="status">{status?.authorized && status.activeJob && !activeJob ? 'A motion request is active in another project.' : activeJob ? '' : live.message === 'Checking service availability.' ? status?.message || live.message : live.message}</p>
    {visible && <GenerationProgress {...live} />}
  </div>;
}
