export function recordDiagnostics(job) {
  const events = job.events ||= [];
  const message = job.message || job.status;
  if (events.at(-1)?.message !== message) events.push({ at: new Date().toISOString(), status: job.status, message });
  if (events.length > 80) events.splice(0, events.length - 80);
  if (['completed', 'failed'].includes(job.status)) job.finishedAt ||= new Date().toISOString();
}

export function diagnostics(job) {
  const status = typeof job.providerStatus === 'string' ? job.providerStatus : job.providerStatus?.status;
  return {
    elapsedSeconds: Math.max(0, Math.floor((Date.parse(job.finishedAt || new Date().toISOString()) - Date.parse(job.createdAt)) / 1000)),
    providerStatus: typeof status === 'string' && /^[a-z_]{1,40}$/.test(status) ? status : null,
    providerRequestId: job.providerId || null,
    lastCheckedAt: job.lastCheckedAt || null,
    lastSuccessfulCheckAt: job.lastSuccessfulCheckAt || null,
    events: job.events || [],
  };
}

export function recoveryReason(error) {
  const status = error?.providerHttpStatus || error?.status;
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError') return 'Provider connection timed out.';
  if (status === 429) return 'Provider rate limit reached.';
  if ([401, 403].includes(status)) return 'Provider authorization failed.';
  if (status >= 500) return 'Provider service returned an error.';
  return 'Status retrieval or output validation could not finish.';
}
