import { useState } from 'react';
import { PlugZap } from 'lucide-react';

type Result = { ok: boolean; message: string; latencyMs?: number; checkedAt?: string };

export default function ConnectionCheck() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  async function check() {
    setBusy(true);
    setResult(null);
    try {
      const response = await fetch('/api/runcomfy/check', {
        method: 'POST', headers: { 'X-Content-Studio-Check': '1' },
        signal: AbortSignal.timeout(20000),
      });
      const data: Result = await response.json();
      if (typeof data.ok !== 'boolean' || typeof data.message !== 'string') throw new Error();
      setResult({ ...data, ok: response.ok && data.ok });
    } catch {
      setResult({ ok: false, message: 'Connection check unavailable. Confirm the local server is running.' });
    } finally {
      setBusy(false);
    }
  }
  return <details className="connection-check">
    <summary>Technical inspector</summary>
    <dl className="package-list">
      <div><dt>Provider</dt><dd>RunComfy</dd></div>
      <div><dt>Model</dt><dd>H3 Max / image to video</dd></div>
      <div><dt>Check</dt><dd>Authenticated model lookup</dd></div>
      <div><dt>Generation</dt><dd>Not submitted</dd></div>
    </dl>
    <button className="button secondary" disabled={busy} onClick={check}>
      {busy ? <span className="spinner" /> : <PlugZap size={16} />}
      {busy ? 'Checking connection' : 'Check connection'}
    </button>
    <div className="connection-result" role="status" aria-live="polite">
      {result && <><strong className={result.ok ? 'connection-ok' : 'connection-error'}>{result.ok ? 'Connected' : 'Not connected'}</strong><span>{result.message}</span>{result.ok && <span>{result.latencyMs} ms / {new Date(result.checkedAt!).toLocaleTimeString()}</span>}</>}
    </div>
  </details>;
}
