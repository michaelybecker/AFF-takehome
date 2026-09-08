import { useEffect, useRef, useState } from 'react';
import type { CampaignMaster } from './data';
import type { LiveJob, LiveStatus } from './provider';

type Api = <T>(action: string, payload?: unknown) => Promise<T>;
export const isActiveJob = (job: LiveJob) => !['completed', 'failed'].includes(job.status);
export const isWorkingJob = (job: LiveJob) => !job.reconciliationRequired && ['submitting', 'queued', 'running', 'receiving'].includes(job.status);

export function useLiveGeneration<S extends LiveStatus>({ api, missionId, requestKey, visitJobs, selectedId, onResults }: {
  api: Api; missionId: string; requestKey: string; visitJobs: Set<string>; selectedId: string;
  onResults: (masters: CampaignMaster[]) => void;
}) {
  const [status, setStatus] = useState<S | null>(null);
  const [jobs, setJobs] = useState<LiveJob[]>([]);
  const [submittingAt, setSubmittingAt] = useState<number | null>(null);
  const [checking, setChecking] = useState(false);
  const [lastCheck, setLastCheck] = useState<number | null>(null);
  const [checkError, setCheckError] = useState('');
  const [message, setMessage] = useState('Checking service availability.');
  const [now, setNow] = useState(Date.now);
  const current = useRef({ selectedId, onResults }); current.current = { selectedId, onResults };
  const mounted = useRef(false);
  const refreshing = useRef(false);
  const submitting = useRef(false);
  async function refresh() {
    if (refreshing.current) return;
    refreshing.current = true; setChecking(true);
    try {
      let health = await api<S>('status');
      if (health.available && !health.authorized && !health.tokenRequired) {
        await api('session', { localReviewer: true });
        health = await api<S>('status');
      }
      if (!mounted.current) return;
      setStatus(health);
      if (health.authorized) {
        const data = await api<{ jobs: LiveJob[] }>(`jobs&missionId=${encodeURIComponent(missionId)}`);
        if (!mounted.current) return;
        // The Sandbox is the durable project history: recover active and completed work.
        for (const job of data.jobs) if (isActiveJob(job)) visitJobs.add(job.id);
        const visibleJobs = data.jobs;
        setJobs(visibleJobs);
        const saved = sessionStorage.getItem(requestKey);
        if (saved) {
          try { if (data.jobs.some(job => job.id === JSON.parse(saved).id)) sessionStorage.removeItem(requestKey); }
          catch { /* Preserve an uncertain submission for idempotent retry. */ }
        }
        current.current.onResults(visibleJobs.flatMap(job => job.result ? [job.result] : []));
      }
      setLastCheck(Date.now()); setCheckError('');
    } catch (error) {
      if (mounted.current) setCheckError(error instanceof Error ? error.message : 'Status check unavailable.');
    } finally { refreshing.current = false; if (mounted.current) setChecking(false); }
  }
  useEffect(() => {
    mounted.current = true; void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 5000);
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    return () => { mounted.current = false; window.clearInterval(timer); window.clearInterval(clock); };
  }, [missionId, api]);
  async function submit(makeInput: () => { id: string; [key: string]: unknown }) {
    if (submitting.current) return;
    submitting.current = true; setSubmittingAt(Date.now()); setMessage('Submitting request.');
    try {
      const saved = sessionStorage.getItem(requestKey);
      const input = saved ? JSON.parse(saved) : makeInput();
      sessionStorage.setItem(requestKey, JSON.stringify(input));
      visitJobs.add(input.id);
      const job = await api<LiveJob>('submit', input);
      sessionStorage.removeItem(requestKey);
      if (mounted.current) {
        setJobs(previous => [...previous.filter(item => item.id !== job.id), job]); setMessage(job.message);
        await refresh();
      }
    } catch (error) {
      if (mounted.current) setMessage(`${error instanceof Error ? error.message : 'Submission unavailable.'} Retry uses the same request.`);
    } finally { submitting.current = false; if (mounted.current) setSubmittingAt(null); }
  }
  const orderedJobs = [...jobs].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const activeJob = orderedJobs.find(isActiveJob);
  return { status, jobs: orderedJobs, activeJob, submittingAt, checking, lastCheck, checkError, message, now, refresh, submit };
}
