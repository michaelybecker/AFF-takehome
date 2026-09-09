import { useState } from 'react';
import { Modal } from './Media';
export type CustomPlacement = { id: string; campaignId: string; name: string; kind: 'still' | 'motion'; width: number; height: number; ratio: string; value: number };
const key = 'gik-custom-placements-v1';
export function loadPlacements(): CustomPlacement[] {
  try { return JSON.parse(localStorage.getItem(key) || '[]').filter((p: CustomPlacement) => /^custom-[a-z0-9-]+$/.test(p.id) && typeof p.name === 'string' && ['still', 'motion'].includes(p.kind) && [p.width, p.height].every(n => Number.isInteger(n) && n >= 64 && n <= 4096)); } catch { return []; }
}
export default function CreatePlacement({ campaignId, initial, onCreate, onClose }: { campaignId: string; initial?: CustomPlacement; onCreate: (p: CustomPlacement) => void; onClose: () => void }) {
  const [name, setName] = useState(initial?.name || '');
  const [kind, setKind] = useState<'still' | 'motion'>(initial?.kind || 'still');
  const [width, setWidth] = useState(initial?.width || 1080), [height, setHeight] = useState(initial?.height || 1080);
  const [error, setError] = useState('');
  return <Modal title={initial ? 'Edit format' : 'Create placement'} subtitle="Define a delivery format for this project" onClose={onClose}><form className="mission-editor" onSubmit={event => {
    event.preventDefault();
    if (!name.trim()) return;
    if (kind === 'motion' && (width % 2 || height % 2)) { setError('Use even pixel dimensions for motion.'); return; }
    const divisor = (a: number, b: number): number => b ? divisor(b, a % b) : a;
    const d = divisor(width, height);
    const placement = { id: initial?.id || 'custom-' + crypto.randomUUID(), campaignId, name: name.trim(), kind, width, height, ratio: `${width / d}:${height / d}`, value: width / height };
    onCreate(placement);
  }}>
    <label className="field">Placement name<input required maxLength={80} value={name} placeholder="e.g. Square social post" onChange={e => setName(e.target.value)} /></label>
    <label className="field">Media type<select value={kind} onChange={e => setKind(e.target.value as 'still' | 'motion')}><option value="still">Still / PSD</option><option value="motion">Motion / MP4</option></select></label>
    <label className="field">Width (px)<input type="number" required min={64} max={4096} step={kind === 'motion' ? 2 : 1} value={width} onChange={e => setWidth(Number(e.target.value))} /></label>
    <label className="field">Height (px)<input type="number" required min={64} max={4096} step={kind === 'motion' ? 2 : 1} value={height} onChange={e => setHeight(Number(e.target.value))} /></label>
    {error && <p role="alert">{error}</p>}<div className="asset-export-actions"><button className="button secondary" type="button" onClick={onClose}>Cancel</button><button className="button primary" type="submit">{initial ? 'Apply changes' : 'Create placement'}</button></div>
  </form></Modal>;
}
