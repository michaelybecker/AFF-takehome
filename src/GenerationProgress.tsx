import { LoaderCircle, RefreshCw, TriangleAlert } from 'lucide-react';
import { isWorkingJob } from './useLiveGeneration';
import type { LiveJob } from './provider';

const label = (job: LiveJob) => ({ submitting: 'Submitting request', queued: 'Queued', running: 'Processing', receiving: 'Receiving result', recovering: 'Checking result availability', unknown: 'Request confirmation needed', completed: 'Draft ready / Review required', failed: 'Generation failed' }[job.status]);
export default function GenerationProgress({ jobs, activeJob, submittingAt, checking, lastCheck, checkError, now, refresh }: {
  jobs: LiveJob[]; activeJob?: LiveJob; submittingAt: number | null; checking: boolean; lastCheck: number | null; checkError: string; now: number; refresh: () => Promise<void>;
}) {
  const start = activeJob ? Date.parse(activeJob.createdAt) : submittingAt;
  const seconds = start === null ? 0 : Math.max(0, Math.floor((now - start) / 1000));
  const elapsed = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  const working = activeJob ? isWorkingJob(activeJob) : submittingAt !== null;
  const stage = activeJob?.reconciliationRequired ? 'Reviewer confirmation required' : activeJob ? label(activeJob) : 'Submitting request';
  return <>
    {(activeJob || submittingAt !== null) && <section className="generation-progress" aria-label="Generation progress" aria-busy={working}>
      <div className="generation-progress-heading">{working ? <LoaderCircle className="generation-spin" size={24} /> : <TriangleAlert size={24} />}<div><strong role="status">{stage}</strong><span>{elapsed} elapsed</span></div></div>
      {working && <div className="generation-indeterminate" role="progressbar" aria-label={stage}><span /></div>}
      <p>{activeJob?.message || 'Waiting for the service to confirm acceptance.'}</p>
      {activeJob?.lastCheckedAt && <small>Provider checked {new Date(activeJob.lastCheckedAt).toLocaleTimeString()}</small>}
      <div className="generation-check"><span>{checking ? 'Checking status...' : lastCheck ? `Status refreshed ${new Date(lastCheck).toLocaleTimeString()}` : 'Waiting for first status check'}</span><button className="icon-button" disabled={checking} title="Check status now" aria-label="Check status now" onClick={() => void refresh()}><RefreshCw size={15} /></button></div>
      {checkError && <p role="status">{checkError} Retrying status checks automatically; no new generation is submitted.</p>}
      {activeJob && <details><summary>Submitted brief</summary><p>{activeJob.generationPrompt || activeJob.direction}</p></details>}
    </section>}
    {!activeJob && submittingAt === null && checkError && <p className="save-notice" role="status">{checkError} Retrying status check.</p>}
    {jobs.some(job => job.status === 'failed') && <div className="exploration-jobs">{jobs.filter(job => job.status === 'failed').map(job => <div key={job.id} role="status"><div><strong>{label(job)}</strong><time dateTime={job.createdAt}>{new Date(job.createdAt).toLocaleTimeString()}</time></div><p>{job.message}</p></div>)}</div>}
  </>;
}
