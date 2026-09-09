import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { CampaignMaster } from './data';
import { changeSandboxAsset, useSandboxRemovalError } from './assistant-bridge';

export default function SandboxAction({ asset }: { asset: CampaignMaster }) {
  const error = useSandboxRemovalError(asset.id);
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (busy || !confirm(`Remove “${asset.title}” from the Sandbox? The private generation record will remain available for provenance.`)) return;
    setBusy(true);
    try { await changeSandboxAsset(asset, 'delete'); }
    catch { /* Shared error survives the card unmounting and being restored. */ }
    finally { setBusy(false); }
  }

  return <div className="sandbox-action"><button type="button" className="text-button" disabled={busy} onClick={() => void remove()}>{busy ? <span className="spinner" /> : <Trash2 size={14} />}{busy ? 'Removing…' : 'Remove from Sandbox'}</button>{error && <p role="alert">{error}</p>}</div>;
}
