import { saveWorkspaceValue } from './workspaceSync';
import CreatePlacement, { loadPlacements } from './CreatePlacement';

import PaginatedGallery from './PaginatedGallery';
import DeliveryOutputs, { type DeliveryOutput } from './DeliveryOutputs';
import DeliveryPreview from './DeliveryPreview';
import { galleryNavigation } from './galleryNavigation';
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check, Download, Expand, Film, ImagePlus, LockKeyhole, Pencil, Plus, Save, Sparkles, X } from 'lucide-react';
import { type CampaignMaster, type Manifest } from './data';
import { ImageViewer, Modal, StillTile, VideoPlayer, VideoTile } from './Media';
import { type GenerationRequest, type Mode } from './provider';
import { anniversaryId, missionStorageKey, newMission, placements as anniversaryPlacements, type Draft, type Mission } from './missions';
import LiveStills from './LiveStills';
import LiveMotion from './LiveMotion';
import './activation.css';
import { assetMime, startAssetDrag, acceptAssetDrag, attachToAssistant } from './assetDrag';
import SandboxAction from './SandboxAction';
import { assistantJobs, projectAssets, useStudioAssets, useStudioMissions } from './assistant-bridge';

const asClip = (master: CampaignMaster) => ({ ...master, poster: master.poster || '', duration: master.duration || 0 });

export default function Activate({ mode, manifest }: { mode: Mode; manifest: Manifest }) {
  const [missions, setMissions] = useStudioMissions();
  const [editing, setEditing] = useState<Mission | null>(null);
  const [, setLiveMasters] = useStudioAssets();
  const visitJobs = useMemo(() => new Set<string>(), [mode]);
  const mission = missions.missions.find(m => m.id === missions.selectedId) || missions.missions[0];
  const draft = mission.draft;
  const campaignId = mission.id;
  const isAnniversary = campaignId === anniversaryId;
  const [customPlacements, setCustomPlacements] = useState(loadPlacements);
  const [creatingPlacement, setCreatingPlacement] = useState(false);
  const placements: { id: string; name: string; kind: 'still' | 'motion'; ratio: string; value: number }[] = [...anniversaryPlacements.map(p => ({ ...p, name: !isAnniversary && p.id === 'A01' ? 'Portrait poster' : p.name })), ...customPlacements.filter(p => p.campaignId === campaignId)];
  const [showLayout, setShowLayout] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [outputs, setOutputs] = useState<DeliveryOutput[]>([]);
  const [generatedPreview, setGeneratedPreview] = useState<DeliveryOutput | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setOutputs([]);
    fetch(`/api/deliveries?action=list&campaignId=${encodeURIComponent(campaignId)}`, { signal: controller.signal }).then(async response => { if (!response.ok) throw Error(); return response.json(); }).then(setOutputs).catch(() => {});
    return () => controller.abort();
  }, [campaignId]);
  const [viewer, setViewer] = useState<{ title: string; src: string; subtitle: string; master?: CampaignMaster } | null>(null);

  const masters = projectAssets(manifest).filter(m => m.campaignId === campaignId);
  const still = masters.find(m => m.id === draft.stillId && m.kind === 'still');
  const motion = masters.find(m => m.id === draft.motionId && m.kind === 'motion');
  const placement = placements.find(p => p.id === draft.placementId) || placements[0];
  const isCreate = mode !== 'adapt';
  const isAnimate = mode === 'animate';
  const kind = isCreate ? (isAnimate ? 'motion' : 'still') : placement.kind;
  const [startingFrame, setStartingFrame] = useState<{ id: string; title: string; src: string }>();
  const selected = kind === 'still' ? still : motion;
  const direction = kind === 'still' ? draft.stillDirection : draft.motionDirection;
  const source = isCreate ? undefined : selected;
  const artifactId = isCreate ? (kind === 'still' ? 'C01' : 'C02') : placement.id;
  const candidates = masters.filter(m => m.kind === kind);
  useEffect(() => { setNotice(''); setViewer(null); setShowLayout(false); setStartingFrame(undefined); }, [mode, campaignId]);
  useEffect(() => { try { saveWorkspaceValue(missionStorageKey, JSON.stringify(missions)); } catch { setNotice('Local storage unavailable. Download the brief to keep it.'); } }, [missions]);
  const update = (value: Partial<Draft>) => { setMissions(previous => ({ ...previous, missions: previous.missions.map(m => m.id === campaignId ? { ...m, draft: { ...m.draft, ...value } } : m) })); setNotice(''); };
  const persist = () => { try { saveWorkspaceValue(missionStorageKey, JSON.stringify(missions)); return true; } catch { return false; } };
  const save = () => setNotice(persist() ? 'Brief saved locally; shared workspace sync is automatic.' : 'Local storage unavailable. Download the brief to keep it.');
  const request = (): GenerationRequest => ({
    id: crypto.randomUUID(), mode, identity: 'iron_man_mark_iii', identityKitVersion: manifest.version,
    adaptationId: isCreate && kind === 'still' ? manifest.derived?.adaptation.id || null : null,
    source: isAnimate ? draft.animationSourceId || null : source?.id || null, campaign: mission.title, campaignId, artifactId, outputKind: kind,
    mission: { ...mission, draft: undefined, briefs: undefined }, sourceLineage: source?.lineage || null,
    direction: isCreate ? direction.trim() : 'Reframe the selected master for the placement. Add typography in downstream Adobe apps.',
    placement: isCreate ? (kind === 'still' ? (isAnniversary ? 'Anniversary key-art master' : 'Still master') : 'Companion motion master') : placement.name,
    dimensions: customPlacements.find(p => p.id === placement.id),
    aspectRatio: isCreate ? '16:9' : placement.ratio,
    duration: kind === 'motion' ? (isCreate ? draft.duration : selected?.duration ?? null) : null,
    copy: isCreate ? { headline: draft.headline, supporting: draft.supporting, cta: draft.cta } : { headline: '', supporting: '', cta: '' },
    layout: isCreate ? null : { fit: draft.fit, focalX: draft.focalX, focalY: draft.focalY, graphics: false },
    createdAt: new Date().toISOString(),
  });
  const prepare = async () => {
    if (!selected || busy) return;
    setBusy(true);
    setNotice('Preparing format…');
    try {
      const response = await fetch('/api/deliveries', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Content-Studio': '1' }, body: JSON.stringify(request()), signal: AbortSignal.timeout(200000) });
      const result = await response.json();
      if (!response.ok) throw Error(result.message || 'Rendering failed.');
      setOutputs(previous => [result, ...previous.filter(output => output.id !== result.id)]);
      setGeneratedPreview(result);
      setNotice(`${result.artifactId} format prepared. Choose an export destination.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Output could not be rendered. Please try again.'); }
    finally { setBusy(false); }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(request(), null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `${campaignId}-${artifactId.toLowerCase()}-brief.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const openMaster = (master: CampaignMaster) => setViewer({ title: master.title, src: master.src, subtitle: `${master.id} · Generated draft · Review pending`, master });
  const selectMaster = (id: string, type: 'still' | 'motion') => {
    if (type === 'still') update({ stillId: id });
    else {
      update({ motionId: id });
    }
  };
  const receiveResults = (type: 'still' | 'motion', results: CampaignMaster[]) => setLiveMasters(previous => [
    ...previous.filter(m => (assistantJobs.has(m.id) && !results.some(r => r.id === m.id)) || m.campaignId !== campaignId || m.kind !== type),
    ...results.filter(m => isCreate || m.id === draft.stillId || m.id === draft.motionId),
  ]);
  const liveControls = <>
    <LiveStills key={`${campaignId}-${mode}-stills`} mission={mission} manifest={manifest} visible={isCreate && kind === 'still'} visitJobs={visitJobs} onResults={results => receiveResults('still', results)} />
    <div hidden={isCreate && kind !== 'motion'}><LiveMotion key={`${campaignId}-${mode}-motion`} mission={mission} manifest={manifest} visible={isAnimate} visitJobs={visitJobs} assets={masters} onSource={value => { setStartingFrame(value); if (value && value.id !== draft.animationSourceId) update({ animationSourceId: value.id, motionId: '' }); }} onDuration={duration => update({ duration })} onResults={results => receiveResults('motion', results)} /></div>
  </>;
  const masterSelect = (type: 'still' | 'motion', label: string) => <label className="field">{label}<select value={(type === 'still' ? still : motion)?.id || ''} onChange={e => selectMaster(e.target.value, type)}><option value="">No master selected</option>{masters.filter(m => m.kind === type).map(m => <option key={m.id} value={m.id}>{m.title}</option>)}</select></label>;
  const layoutPreview = (expanded = false) => <div className={`placement-canvas ${kind === 'still' ? 'transparent-canvas' : ''}`} style={{ aspectRatio: placement.value, width: `min(100%, ${(expanded ? 600 : 390) * placement.value}px)` }}>
    {selected ? <>{expanded ? (kind === 'still' ? <img src={selected.src} alt={selected.title} style={{ objectFit: draft.fit, objectPosition: `${draft.focalX}% ${draft.focalY}%` }} /> : <video key={selected.id} src={selected.src} poster={selected.poster} controls autoPlay muted playsInline style={{ objectFit: draft.fit, objectPosition: `${draft.focalX}% ${draft.focalY}%` }} />) : <button className="placement-media" aria-label="Open layout preview" onClick={() => setShowLayout(true)} onPointerMove={e => { if (e.pointerType === 'touch') return; const v = e.currentTarget.querySelector('video'); if (v && v.readyState >= 1 && Number.isFinite(v.duration)) { const rect = e.currentTarget.getBoundingClientRect(); v.currentTime = Math.max(0, Math.min(.999, (e.clientX - rect.left) / rect.width)) * v.duration; } }}>{kind === 'still' ? <img src={selected.src} alt={selected.title} style={{ objectFit: draft.fit, objectPosition: `${draft.focalX}% ${draft.focalY}%` }} /> : <video key={selected.id} src={selected.src} poster={selected.poster} muted playsInline preload="metadata" style={{ objectFit: draft.fit, objectPosition: `${draft.focalX}% ${draft.focalY}%` }} />}<span className="tile-open" title="Open layout preview"><Expand size={16} /></span></button>}</> : <div className="campaign-empty"><LockKeyhole size={25} /><h3>{kind === 'still' ? 'Still master required' : 'Motion master required'}</h3><p>{placement.ratio} / {placement.id}</p></div>}
  </div>;
  return <>
    <div className="breadcrumbs activation-breadcrumbs">Marvel Studios <span>/</span> {mode.charAt(0).toUpperCase() + mode.slice(1)}</div>
    <div className="page-heading activation-page-heading"><div><span className="eyebrow">IDENTITY ACTIVATION</span><h1>{isAnimate ? 'Animate your still' : isCreate ? 'Create from identity' : 'Prepare a bespoke format'}</h1><p className="subheading">{mission.title}{mission.occasion && <> <span className="muted-dot">·</span> {mission.occasion}</>}</p></div><div className="heading-actions"><button className="button secondary" onClick={save}><Save size={16} />Save brief</button><button className="icon-button" title="Download brief" aria-label="Download brief" onClick={download}><Download size={18} /></button></div></div>
    <div className="workspace-status"><span className="status amber">{selected ? 'Master selected / Review pending' : 'Master selection pending'}</span></div>
    <div className="mission-toolbar"><label className="field">Project<select aria-label="Project" value={campaignId} onChange={e => setMissions(previous => ({ ...previous, selectedId: e.target.value }))}>{missions.missions.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}</select></label><button className="icon-button" title="Edit project" aria-label="Edit project" onClick={() => setEditing({ ...mission })}><Pencil size={16} /></button><button className="button secondary" disabled={missions.missions.length >= 50} onClick={() => setEditing(newMission())}><Plus size={16} />New project</button></div>
    <details id="project-brief" className="mission-overview"><summary>Project brief <span>{draft.headline || mission.title}</span></summary><div className="campaign-mission"><div><span className="eyebrow">MISSION BRIEF</span><h2>{draft.headline || mission.title}</h2><p>{mission.summary || 'Creative brief in progress.'}</p></div><dl><div><dt>Audience</dt><dd>{mission.audience || 'Not set'}</dd></div><div><dt>Objective</dt><dd>{mission.objective || 'Not set'}</dd></div><div><dt>Market</dt><dd>{mission.market || 'Not set'}</dd></div></dl></div>
    <div className="mission-details"><dl className="package-list"><div><dt>Owner</dt><dd>{mission.owner || 'Not set'}</dd></div><div><dt>Message</dt><dd>{mission.message || 'Not set'}</dd></div><div><dt>Constraints</dt><dd>{mission.constraints || 'No additional constraints'}</dd></div></dl></div></details>
    <div className="activation-identity"><img src="/media/stills/studio-hero-portrait.webp" alt="Mark III production portrait" /><div><span className="eyebrow">ACTIVE IDENTITY</span><strong>Iron Man / Mark III</strong></div><span className="package-version">Identity kit v{manifest.version}</span><a href="#/identity">View identity <ArrowRight size={14} /></a></div>
    <div className={`activation-layout anniversary-layout ${isCreate ? 'create-layout' : ''}`}><div className="activation-content">
      <div className="campaign-section-title"><div><span className="eyebrow">{artifactId} / {isCreate ? 'CAMPAIGN MASTER' : 'FORMAT PREPARATION'}</span><h2>{isCreate ? (kind === 'still' ? (isAnniversary ? 'Anniversary key art' : 'Still explorations') : 'Companion motion') : placement.name}</h2></div><span className="quiet-label">{isCreate ? '16:9' : placement.ratio}{kind === 'motion' && (isCreate || selected?.duration) ? ` · ${isCreate ? draft.duration : selected?.duration}s` : ''}</span></div>
      {isCreate ? <div className="campaign-stage master-drop-target" onDragOver={acceptAssetDrag} onDrop={event => { if (!acceptAssetDrag(event)) return; const asset = candidates.find(item => item.id === event.dataTransfer.getData(assetMime)); if (asset) selectMaster(asset.id, asset.kind); }}>{selected ? (selected.kind === 'motion' ? <VideoTile clip={asClip(selected)} onOpen={() => openMaster(selected)} description="Generated draft / Review pending" /> : <StillTile item={{ ...selected, variant: 'Generated draft / Review pending', category: 'hero' }} onOpen={() => openMaster(selected)} />) : isAnimate && startingFrame ? <StillTile item={{ ...startingFrame, variant: 'Starting frame', category: 'hero' }} onOpen={() => setViewer({ title: startingFrame.title, src: startingFrame.src, subtitle: 'Starting frame' })} /> : <div className="campaign-empty">{kind === 'still' ? <ImagePlus size={30} /> : <Film size={30} />}<h3>{kind === 'still' ? 'Key-art master pending' : 'Motion master pending'}</h3><p>{kind === 'still' ? 'Drop a Sandbox still here to make it the key-art master.' : 'Choose a starting frame.'}</p></div>}</div> : <div className="placement-stage">{layoutPreview()}</div>}
      <div className="campaign-stage-caption"><span>{isCreate ? selected ? 'Selected candidate / Review pending' : isAnimate && startingFrame ? 'Starting frame / Animation pending' : 'No generated master registered' : 'Framing preview / Source artwork preserved'}</span>{isCreate && selected && <button className="icon-button" title="Clear selected master" aria-label="Clear selected master" onClick={() => selectMaster('', kind)}><X size={16} /></button>}{isAnimate && startingFrame && !selected && <button className="icon-button" title="Clear starting frame" aria-label="Clear starting frame" onClick={() => { update({ animationSourceId: '' }); setStartingFrame(undefined); }}><X size={16} /></button>}{mode === 'create' && selected && <a className="text-button" href="#/activate/animate" onClick={() => update({ animationSourceId: selected.id, motionId: '' })}>Animate this still <Film size={14} /></a>}{isCreate && selected && <a className="text-button" href="#/activate/adapt" onClick={() => update({ placementId: kind === 'still' ? 'A01' : 'A03' })}>Open ADAPT <ArrowRight size={14} /></a>}</div>
      {isCreate && !!mission.briefs?.filter(b => b.outputKind === kind && b.mode === mode).length && <details className="mission-details"><summary>Prepared {kind === 'still' ? 'still' : 'motion'} briefs</summary>{mission.briefs.filter(b => b.outputKind === kind && b.mode === mode).map(brief => <div className="prepared-brief" key={brief.id}><strong>{brief.artifactId} / Output pending</strong><span>{new Date(brief.createdAt).toLocaleString()}</span><p>{brief.direction}</p><span>{brief.source ? `Source master: ${brief.source}` : 'No source master'}</span><button className="text-button" onClick={() => {
        const url = URL.createObjectURL(new Blob([JSON.stringify(brief, null, 2)], { type: 'application/json' }));
        const link = document.createElement('a'); link.href = url; link.download = `${brief.campaignId}-${brief.artifactId}-${brief.id}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      }}><Download size={14} />Download saved brief</button></div>)}</details>}
      {isCreate ? <>
        <div className="preservation"><span className="eyebrow">IDENTITY CONSTRAINTS</span><div>{['Mark III armor', 'Circular arc reactor', 'Red and gold plates'].map(t => <span key={t}><LockKeyhole size={13} />{t}</span>)}</div></div>
        <section id="sandbox"><div className="campaign-section-title"><div><h3>Sandbox</h3><p className="section-helper">Generated and prepared candidates persist here until you remove them.</p></div><span className="quiet-label">{candidates.length} ASSETS</span></div>
          {candidates.length ? <PaginatedGallery className="campaign-candidates" label="Sandbox" scope={campaignId + kind}>{candidates.map(m => <div key={m.id} draggable onDragStart={event => startAssetDrag(event, m.id)} title="Drag to the master preview or AI Assistant">{m.kind === 'motion' ? <VideoTile clip={asClip(m)} onOpen={() => openMaster(m)} description="Sandbox candidate / Review pending" /> : <StillTile item={{ ...m, variant: 'Sandbox candidate / Review pending', category: 'hero' }} onOpen={() => openMaster(m)} />}<div className="sandbox-card-actions"><button className="text-button" onClick={() => selectMaster(m.id, m.kind)}>{selected?.id === m.id ? <><Check size={14} />Selected master</> : 'Select as master'}</button><button className="text-button" onClick={() => attachToAssistant(m.id)}>Ask assistant</button><SandboxAction asset={m} /></div></div>)}</PaginatedGallery> : <p className="campaign-empty-line">Your sandbox is empty. New generations will appear here and remain available across sessions.</p>}
        </section>
      </> : <><div id="delivery-family" className="campaign-section-title"><h3>Format presets</h3><button className="button secondary" onClick={() => setCreatingPlacement(true)}><Plus size={14} />Create placement</button></div><div className="delivery-list">{placements.map(p => <button key={p.id} className={p.id === placement.id ? 'active' : ''} onClick={() => update({ placementId: p.id })}><span className="delivery-id">{p.id}</span><div><strong>{p.name}</strong><span>{p.kind === 'still' ? 'Still' : 'Motion'} / {p.ratio}</span></div><span className="delivery-status">{(p.kind === 'still' ? still : motion) ? 'Ready to prepare' : 'Master required'}</span><ArrowRight size={14} /></button>)}</div><DeliveryOutputs outputs={outputs.filter(output => output.artifactId === placement.id)} onOpen={setGeneratedPreview} /><p className="campaign-spec-note">Choose one preset or create a custom placement. Prepare and export each format individually.</p></>}
    </div><aside className="brief-panel">
      <div className="campaign-section-title"><h2>{isCreate ? 'Creative brief' : 'Format settings'}</h2></div>
      {isCreate ? <><label className="field">Creative direction<textarea rows={5} maxLength={1500} value={direction} onChange={e => update(kind === 'still' ? { stillDirection: e.target.value } : { motionDirection: e.target.value })} /></label><span className="character-count">{direction.length} / 1500</span>{liveControls}</> : <><label className="field">Placement<select value={placement.id} onChange={e => update({ placementId: e.target.value })}>{placements.map(p => <option key={p.id} value={p.id}>{p.name} / {p.ratio}</option>)}</select></label>{masterSelect(kind, kind === 'still' ? 'Still master' : 'Motion master')}<fieldset className="framing-fields" disabled={!selected}><legend>Framing</legend><label className="field">Image fit<select value={draft.fit} onChange={e => update({ fit: e.target.value as Draft['fit'] })}><option value="contain">Fit entire master</option><option value="cover">Fill placement</option></select></label><label className="field">Horizontal position<input aria-label="Horizontal position" type="range" min={0} max={100} value={draft.focalX} onChange={e => update({ focalX: Number(e.target.value) })} /></label><label className="field">Vertical position<input aria-label="Vertical position" type="range" min={0} max={100} value={draft.focalY} onChange={e => update({ focalY: Number(e.target.value) })} /></label></fieldset></>}
      {!isCreate && <>{liveControls}<div className="campaign-brief-scope"><span className="eyebrow">{kind === 'still' ? 'PHOTOSHOP HANDOFF' : 'MOTION HANDOFF'}</span>{(kind === 'still' ? ['Original embedded as a Smart Object', 'Editable framing in Photoshop', 'Transparent unfilled canvas'] : ['Original performance and timing', 'Resized MP4 for downstream editing']).map(t => <span key={t}><Check size={14} />{t}</span>)}</div></>}
      {!isCreate && <button className="button primary full" disabled={busy || !selected} onClick={prepare}>{busy ? <span className="spinner" /> : <Sparkles size={16} />}{busy ? 'Preparing…' : 'Prepare format'}</button>}
      {!isCreate && <p className="section-helper">{kind === 'still' ? 'Creates an editable PSD. Add text, retouch and finish in Photoshop.' : 'Creates a flattened MP4 in this format. Finish in Premiere Pro or After Effects.'}</p>}
      {notice && <p className="save-notice" role="status">{notice}</p>}
    </aside></div>
    {editing && <Modal title={missions.missions.some(m => m.id === editing.id) ? 'Edit project' : 'New project'} subtitle="Iron Man / Mark III" onClose={() => setEditing(null)}><form className="mission-editor" onSubmit={event => {
      event.preventDefault();
      if (!editing.title.trim()) return;
      const next = { ...editing, title: editing.title.trim() };
      setMissions(previous => ({ ...previous, selectedId: next.id, missions: previous.missions.some(m => m.id === next.id) ? previous.missions.map(m => m.id === next.id ? next : m) : [...previous.missions, next] }));
      setEditing(null);
    }}>{(['title', 'occasion', 'summary', 'audience', 'objective', 'market', 'owner', 'message', 'constraints'] as const).map(key => <label className="field" key={key}>{key === 'title' ? 'Project name' : key[0].toUpperCase() + key.slice(1)}{key === 'constraints' || key === 'summary' ? <textarea rows={key === 'constraints' ? 4 : 2} maxLength={key === 'constraints' ? 2000 : 500} value={editing[key]} onChange={e => setEditing({ ...editing, [key]: e.target.value })} /> : <input required={key === 'title'} maxLength={500} value={editing[key]} onChange={e => setEditing({ ...editing, [key]: e.target.value })} />}</label>)}<button className="button primary" type="submit"><Save size={16} />Save project</button></form></Modal>}
    {creatingPlacement && <CreatePlacement campaignId={campaignId} onClose={() => setCreatingPlacement(false)} onCreate={p => { setCustomPlacements(previous => [...previous, p]); update({ placementId: p.id }); setCreatingPlacement(false); }} />}
    {generatedPreview && <DeliveryPreview output={generatedPreview} onClose={() => setGeneratedPreview(null)} />}
    {showLayout && <Modal title={placement.name} subtitle={`${placement.id} · Layout preview · Review pending`} wide onClose={() => setShowLayout(false)}><div className="placement-modal">{layoutPreview(true)}</div></Modal>}
    {viewer && <Modal navigation={galleryNavigation(candidates, viewer.master?.id, openMaster)} title={viewer.title} subtitle={viewer.subtitle} wide onClose={() => setViewer(null)}>{viewer.master && <div className="asset-modal-actions"><button className="button primary" onClick={() => { selectMaster(viewer.master!.id, viewer.master!.kind); setViewer(null); }}>{viewer.master.kind === 'still' ? 'Make key-art master' : 'Make motion master'}</button><button className="button secondary" onClick={() => { attachToAssistant(viewer.master!.id); setViewer(null); }}>Ask assistant about this</button></div>}{viewer.master?.kind === 'motion' ? <VideoPlayer key={viewer.master.id} clip={asClip(viewer.master)} autoPlay /> : <ImageViewer key={viewer.src} item={{ title: viewer.title, src: viewer.src, variant: viewer.subtitle }} />}</Modal>}
  </>;
}
