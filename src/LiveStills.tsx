import { RefreshCw, Sparkles } from 'lucide-react';
import type { CampaignMaster, Manifest } from './data';
import type { Mission } from './missions';
import { stillApi, type LiveStatus } from './provider';
import { isWorkingJob, useLiveGeneration } from './useLiveGeneration';
import GenerationProgress from './GenerationProgress';

export default function LiveStills({ mission, manifest, visible, visitJobs, onResults }: {
  mission: Mission; manifest: Manifest; visible: boolean; visitJobs: Set<string>; onResults: (masters: CampaignMaster[]) => void;
}) {
  const live = useLiveGeneration<LiveStatus>({ api: stillApi, missionId: mission.id, requestKey: `content-studio-live-request-${mission.id}`, visitJobs, selectedId: mission.draft.stillId, onResults });
  const { status, activeJob, submittingAt } = live;
  const working = activeJob && isWorkingJob(activeJob);
  if (!visible) return null;
  return <div className="live-generation">
    <div className="campaign-section-title"><h3>{visible ? 'Generate with identity' : 'Saved still access'}</h3><button className="icon-button" disabled={live.checking} title="Refresh generation status" aria-label="Refresh generation status" onClick={() => void live.refresh()}><RefreshCw size={15} /></button></div>
    {visible && <span className="status amber">{status?.available ? (status.temporary ? 'LIVE / Temporary review session' : 'LIVE / Stills available') : 'LIVE unavailable'}</span>}
    {visible && <button className="button primary full" disabled={submittingAt !== null || !!activeJob || !status?.available || !status.authorized || status.activeJob || !!live.checkError || !mission.draft.stillDirection.trim()} onClick={() => void live.submit(() => ({ id: crypto.randomUUID(), missionId: mission.id, missionTitle: mission.title, direction: mission.draft.stillDirection.trim(), identityKitVersion: manifest.version, adaptationId: manifest.derived?.adaptation.id, seed: crypto.getRandomValues(new Uint32Array(1))[0] % 2147483648 }))}>{submittingAt !== null || working ? <span className="spinner" /> : <Sparkles size={16} />}{submittingAt !== null ? 'Submitting request' : activeJob ? working ? 'Still in progress' : 'Awaiting confirmation' : 'Generate still exploration'}</button>}
    <p className="save-notice" role="status">{status?.authorized && status.activeJob && !activeJob ? 'A still request is active in another mission.' : activeJob ? '' : live.message === 'Checking service availability.' ? status?.message || live.message : live.message}</p>
    {visible && <GenerationProgress {...live} />}
  </div>;
}
