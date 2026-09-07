import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Clapperboard, Download, Film, ImagePlus, LockKeyhole, Save, Sparkles } from 'lucide-react';
import { clipTitle, type Clip, type Manifest } from './data';
import { VideoPlayer, VideoTile } from './Media';
import { provider, type GenerationJob, type GenerationRequest, type Mode } from './provider';

const campaigns = [
  { id: 'tokyo', name: 'Tokyo premiere', market: 'Japan', environment: 'Shibuya, night', weather: 'Heavy rain', direction: 'Rain-soaked Tokyo premiere environment with urban reflections and a premium theatrical campaign treatment.' },
  { id: 'alpine', name: 'Alpine release', market: 'Switzerland', environment: 'Alpine landscape, dawn', weather: 'Light snow', direction: 'A pristine alpine environment at dawn, with soft snow and a restrained theatrical campaign treatment.' },
  { id: 'vegas', name: 'Las Vegas experiential', market: 'United States', environment: 'Las Vegas, night', weather: 'Clear', direction: 'An expansive Las Vegas premiere environment with architectural light and a premium experiential campaign treatment.' },
];

type Draft = { sourceId: string; campaignId: string; direction: string; placement: string; format: string };
function initialDraft(): Draft {
  const base = { sourceId: 'Hero0', campaignId: 'tokyo', direction: campaigns[0].direction, placement: 'Digital / social', format: '16:9' };
  try { const saved = JSON.parse(localStorage.getItem('content-studio-draft') || 'null'); if (saved && typeof saved.sourceId === 'string' && typeof saved.direction === 'string' && typeof saved.placement === 'string' && ['16:9', '9:16', '1:1'].includes(saved.format) && campaigns.some(c => c.id === saved.campaignId)) return saved; } catch { /* An unavailable or old draft should not prevent opening the workspace. */ }
  return base;
}

export default function Activate({ mode, manifest, onOpen }: { mode: Mode; manifest: Manifest; onOpen: (clip: Clip) => void }) {
  const [draft, setDraft] = useState< Draft>(initialDraft);
  const [job, setJob] = useState<GenerationJob | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [showShots, setShowShots] = useState(false);
  const [review, setReview] = useState(false);
  const campaign = campaigns.find(c => c.id === draft.campaignId)!;
  const source = manifest.clips.find(c => c.id === draft.sourceId) || manifest.clips[0];
  useEffect(() => { setJob(null); setReview(false); setNotice(''); }, [mode]);
  const update = (value: Partial<Draft>) => { setDraft(previous => ({ ...previous, ...value })); setJob(null); setReview(false); setNotice(''); };
  const save = () => { try { localStorage.setItem('content-studio-draft', JSON.stringify(draft)); setNotice('Brief saved on this device'); } catch { setNotice('Local storage is unavailable. Download the brief to keep it.'); } };
  const request = (): GenerationRequest => ({ id: crypto.randomUUID(), mode, identity: 'iron_man_mark_iii', source: mode === 'create' ? null : source.id, campaign: campaign.name, direction: draft.direction.trim(), placement: mode === 'adapt' ? `${draft.placement} / ${draft.format}` : draft.placement, createdAt: new Date().toISOString() });
  const prepare = async () => { if (!draft.direction.trim()) return; setBusy(true); const next = await provider.submit(request()); setJob(next); setBusy(false); setReview(true); save(); };
  const download = () => { const blob = new Blob([JSON.stringify(job?.request || request(), null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `content-studio-${mode}-brief.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
  const title = mode === 'reuse' ? 'Reuse approved production' : mode === 'create' ? 'Create from identity' : 'Adapt for every placement';
  return <>
    <div className="breadcrumbs">Marvel Studios <span>/</span> Activate <span>/</span> {mode.toUpperCase()}</div>
    <div className="page-heading"><div><span className="eyebrow">IDENTITY ACTIVATION</span><h1>{title}</h1><p className="subheading">Iron Man / Mark III <span className="muted-dot">·</span> {mode === 'reuse' ? 'Campaign recontextualization' : mode === 'create' ? 'New campaign composition' : 'Channel adaptation'}</p></div><button className="button secondary" onClick={save}><Save size={16} /> Save brief</button></div>
    <div className="activation-tabs" role="navigation" aria-label="Activation modes">{(['reuse', 'create', 'adapt'] as Mode[]).map(m => <a key={m} href={`#/activate/${m}`} className={mode === m ? 'active' : ''}>{m.toUpperCase()}</a>)}<span className="spacer" /><span className="status amber">{mode === 'reuse' ? 'Pilot workflow' : 'In development'}</span></div>
    <div className="activation-identity"><img src="/media/passes/beauty/0001.webp" alt="Iron Man Mark III" /><div><span className="eyebrow">ACTIVE IDENTITY</span><strong>Iron Man / Mark III</strong></div><span className="package-version">Identity kit v{manifest.version}</span><a href="#/identity">View identity <ArrowRight size={14} /></a></div>
    <div className="activation-layout">
      <div className="activation-content">
        {mode !== 'create' ? <><div className="section-heading compact"><div><span className="step">01</span><h2>Source production</h2></div><button className="text-button" onClick={() => setShowShots(!showShots)}>{showShots ? 'Close selection' : 'Change shot'} <Clapperboard size={15} /></button></div>
          {showShots ? <div className="shot-selection">{manifest.clips.filter(c => c.id.startsWith('Hero')).map(clip => <VideoTile key={clip.id} clip={clip} selected={source.id === clip.id} onOpen={onOpen} onSelect={() => { update({ sourceId: clip.id }); setShowShots(false); }} />)}</div> : <div className="source-player"><VideoPlayer key={source.id} clip={source} onExpand={() => onOpen(source)} /><div className="source-caption"><strong>{clipTitle(source)}</strong><span>{source.id} <span className="muted-dot">·</span> Production reference</span></div></div>}
          <div className="preservation"><span className="eyebrow">REQUESTED PRESERVATION</span><div>{['Identity', 'Performance', 'Camera & timing'].map(text => <span key={text}><LockKeyhole size={13} />{text}</span>)}</div></div></> : <><div className="section-heading compact"><div><span className="step">01</span><h2>Identity grounding</h2></div><span className="status amber">Capability pending</span></div><div className="create-grounding"><img src="/media/passes/beauty/0001.webp" alt="Canonical front view" /><img src="/media/passes/beauty/0013.webp" alt="Canonical side view" /><img src="/media/passes/beauty/0025.webp" alt="Canonical rear view" /></div><div className="preservation"><span className="eyebrow">IDENTITY CONSTRAINTS</span><div>{['Mark III armor', 'Circular arc reactor', 'Red & gold palette'].map(text => <span key={text}><LockKeyhole size={13} />{text}</span>)}</div></div></>}
        <div className="section-heading compact result-heading"><div><span className="step">03</span><h2>{mode === 'create' ? 'New composition' : 'Campaign variant'}</h2></div><span className="status muted">{job ? 'Brief prepared' : 'No output'}</span></div>
        <div className="result-placeholder">{mode === 'create' ? <ImagePlus size={28} /> : <Film size={28} />}<h3>{job ? 'Awaiting campaign output' : 'No campaign output yet'}</h3><p>{job ? `${campaign.name} · ${draft.placement}` : 'Creative review pending'}</p>{job && <button className="button secondary" onClick={download}><Download size={15} /> Download brief</button>}</div>
      </div>
      <aside className="brief-panel"><div className="section-heading compact"><div><span className="step">02</span><h2>Campaign intent</h2></div></div>
        <label className="field">Campaign<select value={draft.campaignId} onChange={e => { const c = campaigns.find(c => c.id === e.target.value)!; update({ campaignId: c.id, direction: c.direction }); }}>{campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <div className="brief-facts"><div><span>Market</span><strong>{campaign.market}</strong></div><div><span>Environment</span><strong>{campaign.environment}</strong></div><div><span>Atmosphere</span><strong>{campaign.weather}</strong></div></div>
        <label className="field">Placement<select value={draft.placement} onChange={e => update({ placement: e.target.value })}><option>Digital / social</option><option>Digital out-of-home</option><option>Experiential</option><option>Theatrical marketing</option></select></label>
        {mode === 'adapt' && <label className="field">Output format<select value={draft.format} onChange={e => update({ format: e.target.value })}><option>16:9</option><option>9:16</option><option>1:1</option></select></label>}
        <label className="field">Creative direction<textarea value={draft.direction} onChange={e => update({ direction: e.target.value })} maxLength={1500} rows={6} /></label><span className="character-count">{draft.direction.length} / 1500</span>
        <div className="generate-summary"><span className="eyebrow">{mode === 'create' ? 'CREATIVE SCOPE' : 'GENERATE'}</span>{(mode === 'adapt' ? ['Framing', 'Placement', 'Campaign treatment'] : ['Environment', 'Atmosphere', 'Campaign treatment']).map(t => <div key={t}><Check size={14} /> {t}</div>)}</div>
        <button className="button primary full" disabled={busy || !draft.direction.trim()} onClick={prepare}>{busy ? <span className="spinner" /> : <Sparkles size={16} />}Prepare {mode === 'create' ? 'composition' : 'campaign variant'}<ArrowRight size={16} /></button>
        {review && <div className="brief-confirmation" role="status"><CheckCircle2 size={17} /><div><strong>Brief prepared</strong><span>Awaiting experimental output</span></div></div>}
        <p className="save-notice" role="status">{notice}</p>
        {job && <button className="text-button" onClick={() => { setReview(false); setJob(null); }}><ArrowLeft size={14} />Revise brief</button>}
      </aside>
    </div>
  </>;
}
