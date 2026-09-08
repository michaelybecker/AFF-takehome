import PaginatedGallery from './PaginatedGallery';
import { Fragment, useEffect, useRef, useState } from 'react';
import { ArrowUp, Check, ChevronLeft, ChevronRight, RefreshCw, Sparkles, Trash2, X, Maximize2, Minimize2, PanelsTopLeft } from 'lucide-react';
import type { CampaignMaster, Manifest } from './data';
import type { MotionStatus, JobDiagnostics } from './provider';
import { setStudioMissions } from './assistant-bridge';
import { capabilities, executeAssistantAction, studioContext, useStudioAssets, useStudioMissions, type AssistantAction, type Receipt } from './assistant-bridge';
import './assistant.css';
import { assetMime, acceptAssetDrag } from './assetDrag';
import SandboxAction from './SandboxAction';
import { prepareVisualReview, type ReviewAsset, type VisualReview } from './visualReview';
import { ScanEye } from 'lucide-react';
import { animationSources } from './animationSources';


type Message = { role: 'user' | 'assistant'; content: string };
type Proposal = { messageIndex?: number; action: AssistantAction; state: 'pending' | 'running' | 'done' | 'error' | 'cancelled'; detail?: string; receipt?: Receipt; diagnostics?: JobDiagnostics };
function MotionReferences({ proposal, health, assets, onChange }: { proposal: Proposal; health: MotionStatus; assets: Pick<CampaignMaster, 'id' | 'title' | 'src' | 'kind' | 'lineage'>[]; expression: NonNullable<Manifest['stills']>; onChange: (args: Record<string, unknown>) => void }) {
  const args = proposal.action.arguments;
  const ids = [args.sourceId, ...(Array.isArray(args.referenceIds) ? args.referenceIds : [])].filter((id): id is string => typeof id === 'string' && !!id);
  const refs = animationSources(assets, health.curatedReferences || []);
  return <fieldset className="assistant-motion-fields" disabled={proposal.state !== 'pending'}>
    <legend>Starting frame</legend>
    <PaginatedGallery className="assistant-reference-picker" label="Starting frames" scope={proposal.action.id}>{refs.map(ref => <label className="assistant-reference" key={ref.id} title={ref.title}><input type="radio" name={`assistant-source-${proposal.action.id}`} aria-label={ref.title} checked={ids[0] === ref.id} onChange={() => {
      onChange({ ...args, mode: 'image-to-video', sourceId: ref.id, referenceIds: [] });
    }} /><img src={ref.src} alt="" /><span>{ref.title}<small>{ref.group || 'Generated images'}</small></span></label>)}</PaginatedGallery>
  </fieldset>;
}
const labels: Record<string, string> = { create_mission: 'Create project', update_brief: 'Update brief', generate_still: 'Generate still', generate_motion: 'Animate still', select_master: 'Select master', inspect_identity: 'Inspect identity', navigate: 'Open workspace' };
const setSelectedMission = (id: string) => setStudioMissions(previous => previous.missions.some(m => m.id === id) ? { ...previous, selectedId: id } : previous);
export default function StudioAssistant({ manifest, route }: { manifest: Manifest; route: string }) {
  const [open, setOpen] = useState(() => window.innerWidth >= 1450);
  const [expanded, setExpanded] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ available: boolean; model?: string; message?: string }>({ available: false });
  const [error, setError] = useState('');
  const [reviewId, setReviewId] = useState('');
  const [reviewProgress, setReviewProgress] = useState('');
  const [reviewEvidence, setReviewEvidence] = useState<VisualReview | null>(null);
  const [health, setHealth] = useState<Awaited<ReturnType<typeof capabilities>> | null>(null);
  const [missions] = useStudioMissions(); useStudioAssets();
  const lock = useRef(false);
  const log = useRef<HTMLDivElement>(null);
  const mission = missions.missions.find(m => m.id === missions.selectedId)!;
  const context = studioContext(manifest, route);
  const attached = context.availableAssets.find(asset => asset.id === reviewId);
  useEffect(() => {
    const attach = (event: Event) => { setReviewId((event as CustomEvent<string>).detail); setOpen(true); setExpanded(false); };
    window.addEventListener('studio-attach-asset', attach);
    return () => window.removeEventListener('studio-attach-asset', attach);
  }, []);
  const running = proposals.some(p => p.state === 'running');
  async function refresh() {
    try { const response = await fetch('/api/assistant?action=status', { signal: AbortSignal.timeout(10000) }); if (!response.ok) throw new Error(); const value = await response.json(); setStatus({ available: value.available === true, model: value.model, message: value.message }); }
    catch { setStatus({ available: false }); }
    setHealth(await capabilities());
  }
  useEffect(() => { void refresh(); }, []);
  useEffect(() => { document.body.classList.toggle('studio-assistant-open', open); return () => document.body.classList.remove('studio-assistant-open'); }, [open]);
  useEffect(() => {
    document.body.classList.toggle('assistant-workspace-active', expanded);
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setExpanded(false); };
    window.addEventListener('keydown', escape);
    return () => { document.body.classList.remove('assistant-workspace-active'); window.removeEventListener('keydown', escape); };
  }, [expanded]);
  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight, behavior: 'smooth' }); }, [messages, proposals]);
  const updateProposal = (id: string, patch: Partial<Proposal>) => setProposals(previous => previous.map(p => p.action.id === id ? { ...p, ...patch } : p));
  async function regenerate(proposal: Proposal) {
    if (lock.current || busy || running || proposal.state !== 'done' || !proposal.receipt?.asset) return;
    lock.current = true;
    setBusy(true);
    try {
      setHealth(await capabilities());
      const action = { ...proposal.action, id: crypto.randomUUID(), arguments: structuredClone(proposal.action.arguments) };
      setMessages(previous => [...previous, { role: 'assistant', content: 'Regenerate with the same prompt, images and settings. A fresh seed creates a new variation; the original result is preserved. Starting a new variation.' }]);
      setProposals(previous => [...previous, { action, messageIndex: messages.length, state: 'pending' }]);
      lock.current = false; await execute(action);
    } finally { lock.current = false; setBusy(false); }
  }
  async function execute(action: AssistantAction) {
    if (lock.current) return;
    lock.current = true; updateProposal(action.id, { state: 'running', detail: 'Applying action...' });
    try { const receipt = await executeAssistantAction(action, manifest, (detail, job) => updateProposal(action.id, { detail, ...(job?.diagnostics ? { diagnostics: job.diagnostics } : {}) })); updateProposal(action.id, { state: 'done', detail: receipt.text, receipt }); }
    catch (e) { updateProposal(action.id, { state: 'error', detail: e instanceof Error ? e.message : 'Action failed.' }); }
    finally { lock.current = false; }
  }
  async function send(reviewAsset: ReviewAsset | undefined = attached) {
    if ((!input.trim() && !reviewAsset) || busy || running || !status.available || lock.current) return;
    const question = reviewAsset ? `Regarding the attached ${reviewAsset.kind}: ${reviewAsset.title} (${reviewAsset.id}). ${input.trim() || 'Prioritize armor fidelity, anatomy, unwanted emissions and creative quality. Give timestamped observations where available, uncertainties, and a revised generation prompt. Do not generate yet.'}` : input.trim();
    const next: Message[] = [...messages, { role: 'user', content: question }];
    setInput(''); setMessages(next); setBusy(true); setError('');
    try {
      const live = await capabilities(); setHealth(live);
      let evidence: VisualReview | null = null;
      if (reviewAsset) {
        const catalog = 'curatedReferences' in live.motion ? live.motion.curatedReferences : [];
        const lineage = (reviewAsset.lineage || {}) as Record<string, unknown>;
        const referenceIds = [lineage.sourceStillId, lineage.parentId, ...(Array.isArray(lineage.referenceIds) ? lineage.referenceIds : [])];
        const used = catalog.filter(ref => referenceIds.includes(ref.id));
        evidence = await prepareVisualReview(reviewAsset, used.length ? used : (manifest.stills || []).slice(0, 2), setReviewProgress);
        if (!used.length) evidence.notes.push('Comparison uses approved identity examples, not verified original generation inputs.');
        setReviewEvidence(evidence); setReviewId(reviewAsset.id); setOpen(true);
        setReviewProgress('Reviewing visual evidence...');
      }
      const response = await fetch('/api/assistant', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Content-Studio': '1' }, signal: AbortSignal.timeout(90000),
        body: JSON.stringify({ ...(evidence ? { review: evidence } : {}), messages: next.slice(-24), context: { ...studioContext(manifest, route), capabilities: live, pendingProposals: proposals.filter(p => p.state === 'pending').map(p => ({ name: p.action.name, arguments: p.action.arguments })), executionReceipts: proposals.filter(p => p.state !== 'pending').slice(-12).map(p => ({ actionId: p.action.id, name: p.action.name, status: p.state, message: p.detail })) } }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Assistant request failed.');
      if (typeof result.text !== 'string' || !Array.isArray(result.actions)) throw new Error('Assistant returned an invalid response.');
      setMessages([...next, { role: 'assistant', content: result.text }]);
      const actions: AssistantAction[] = result.actions.slice(0, 4).filter((a: AssistantAction) => a && typeof a.id === 'string' && labels[a.name] && a.arguments && typeof a.arguments === 'object').map((a: AssistantAction) => {
        const catalog = animationSources(studioContext(manifest, route).availableAssets, 'curatedReferences' in live.motion ? live.motion.curatedReferences : []);
        const requested = String(a.arguments.sourceId || '');
        const requestedAsset = context.availableAssets.find(asset => asset.id === requested);
        const sourceId = catalog.find(ref => ref.id === requested || (requestedAsset && ref.src === requestedAsset.src))?.id || '';
        return { ...a, id: crypto.randomUUID(), arguments: a.name === 'generate_motion' ? { ...a.arguments, mode: 'image-to-video', sourceId, referenceIds: [] } : a.arguments };
      });
      setProposals(previous => [...previous.map(p => p.state === 'pending' ? { ...p, state: 'cancelled' as const, detail: 'Superseded by a new request.' } : p), ...actions.map(action => ({ action, messageIndex: next.length, state: 'pending' as const }))]);      for (const action of actions) if (['navigate', 'inspect_identity'].includes(action.name) || (action.name.startsWith('generate_') && action.arguments.confirmRequired === false && (action.name !== 'generate_motion' || action.arguments.sourceId))) await execute(action);
    } catch (e) { setError(e instanceof Error ? e.message : 'Assistant request failed.'); }
    finally { setBusy(false); setReviewProgress(''); }
  }
  return <aside className={`studio-assistant ${open ? 'is-open' : 'is-closed'} ${expanded ? 'is-expanded' : ''}`} aria-label="AI Assistant" onDragOver={event => { if (acceptAssetDrag(event)) setOpen(true); }} onDrop={event => { if (!acceptAssetDrag(event)) return; const id = event.dataTransfer.getData(assetMime); if (context.availableAssets.some(asset => asset.id === id)) { setReviewId(id); setOpen(true); } }}>
    <header className="assistant-heading">{expanded ? <img className="assistant-brand" src="/media/brand/firefly.svg" alt="" /> : <button className="icon-button" title={open ? 'Collapse AI Assistant' : 'Open AI Assistant'} aria-label={open ? 'Collapse AI Assistant' : 'Open AI Assistant'} aria-expanded={open} onClick={() => setOpen(!open)}>{open ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}</button>}{open ? <><strong>AI Assistant <span className="assistant-beta">Beta</span></strong>{expanded && <button className="text-button assistant-detail-mode" onClick={() => setExpanded(false)}><PanelsTopLeft size={16} />Detailed workspace</button>}<button className="icon-button" title={expanded ? 'Dock assistant' : 'Expand assistant to full screen'} aria-label={expanded ? 'Dock assistant' : 'Expand assistant to full screen'} onClick={() => setExpanded(!expanded)}>{expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button><button className="icon-button" title="New conversation" aria-label="New conversation" disabled={busy || running} onClick={() => { setMessages([]); setProposals([]); setError(''); setReviewEvidence(null); setReviewId(''); }}><Trash2 size={15} /></button></> : <Sparkles size={17} />}</header>
    {expanded && <nav className="assistant-missions" aria-label="Assistant projects"><span className="eyebrow">PROJECTS</span>{missions.missions.map(item => <button key={item.id} className={item.id === missions.selectedId ? 'selected' : ''} disabled={busy || running} onClick={() => setSelectedMission(item.id)}>{item.title}</button>)}<a href="#/activate/create" onClick={() => setExpanded(false)}><PanelsTopLeft size={15} />Detailed workspace</a></nav>}
    {open && <><div className="assistant-context"><img src="/media/stills/studio-hero-portrait.webp" alt="Iron Man Mark III" /><div><strong>Iron Man / Mark III</strong><span>{mission.title}</span><small>{route === 'identity' ? 'Identity' : route === 'create' ? 'Create' : route === 'animate' ? 'Animate' : 'Adapt'} · Current workspace</small></div></div>
    <details className="assistant-context-details"><summary>Context and connection</summary><p>{mission.summary}</p><p>Project: {mission.id}</p><p>Still master: {mission.draft.stillId || 'None'}<br />Motion master: {mission.draft.motionId || 'None'}</p><p>{context.availableAssets.length} project assets · Stills {health?.still.available ? 'available' : 'unavailable'} · Motion {health?.motion.available ? 'available' : 'unavailable'}</p><p>Prototype assistant{status.model ? ` · ${status.model}` : ''}. Uses this session conversation and curated studio instructions. Separate from Codex and Adobe AI Assistant.</p></details>
    <div className="assistant-log" ref={log} role="log" aria-label="Assistant conversation" aria-live="polite">
      {!messages.length && <div className="assistant-empty"><Sparkles size={23} /><h2>What would you like to create?</h2><div className="assistant-suggestions">{(route === 'identity' ? ['Summarize this identity and its creative constraints', 'Help me develop a new project'] : ['Refine this project\'s creative direction', mission.draft.stillId ? 'Propose motion from my selected still' : 'Propose a still for this project']).map(text => <button key={text} disabled={!status.available} onClick={() => setInput(text)}>{text}<ChevronRight size={14} /></button>)}</div></div>}
      {messages.map((message, i) => <Fragment key={i}><div className={`assistant-message ${message.role}`}><strong>{message.role === 'user' ? 'You' : 'AI Assistant'}</strong><p>{message.content}</p></div>      {proposals.filter(p => p.messageIndex === i).map(p => { const args = p.action.arguments; const target = missions.missions.find(m => m.id === args.missionId); const sourceIds = Array.isArray(args.referenceIds) ? args.referenceIds : [args.sourceId || args.masterId]; const sources = context.availableAssets.filter(a => sourceIds.includes(a.id)); return <article key={p.action.id} className="assistant-action"><strong>{labels[p.action.name]}</strong>{target && <span>{target.title}</span>}{sources.map(source => <img key={source.id} src={source.kind === 'motion' ? source.poster : source.src} alt={source.title} />)}{p.action.name === 'generate_motion' && health && 'curatedReferences' in health.motion && <MotionReferences proposal={p} health={health.motion} expression={manifest.stills || []} assets={context.availableAssets.filter(a => a.kind === 'still')} onChange={argumentsValue => updateProposal(p.action.id, { action: { ...p.action, arguments: argumentsValue } })} />}{typeof args.direction === 'string' && (p.state === 'pending' && p.action.name.startsWith('generate_') ? <label className="assistant-prompt-editor">Prompt<textarea aria-label="Generation prompt" rows={6} maxLength={1500} value={args.direction} disabled={busy || running} onChange={event => updateProposal(p.action.id, { action: { ...p.action, arguments: { ...args, direction: event.target.value } } })} /><span>{args.direction.length} / 1500</span></label> : <p>{args.direction}</p>)}{p.action.name === 'generate_motion' && <p>{String(args.duration)} seconds · Animate still</p>}{!p.action.name.startsWith('generate_') && p.state === 'pending' && <details><summary>Review changes</summary><pre>{JSON.stringify(args.fields || args, null, 2)}</pre></details>}{p.state === 'pending' ? <><p>{p.action.name.startsWith('generate_') ? 'Result will be added to the Sandbox for review.' : 'Review and apply to the workspace.'}</p><div className="assistant-action-buttons"><button className="button primary" disabled={busy || running || (p.action.name === 'generate_motion' && !args.sourceId) || (p.action.name.startsWith('generate_') && (typeof args.direction !== 'string' || !args.direction.trim()))} onClick={() => void execute(p.action)}><Check size={14} />{p.action.name.startsWith('generate_') ? 'Generate' : 'Apply'}</button><button className="icon-button" disabled={busy || running} title="Dismiss action" aria-label="Dismiss action" onClick={() => updateProposal(p.action.id, { state: 'cancelled', detail: 'Dismissed. No action taken.' })}><X size={15} /></button></div></> : <p className={p.state === 'error' ? 'assistant-error' : ''}>{p.state === 'running' && <span className="spinner" />}{p.detail}</p>}{p.diagnostics && <details className="assistant-job-diagnostics"><summary>Generation activity · {Math.floor(p.diagnostics.elapsedSeconds / 60)}m {p.diagnostics.elapsedSeconds % 60}s</summary><p>Provider: {p.diagnostics.providerStatus || 'Awaiting status'}<br />Last successful check: {p.diagnostics.lastSuccessfulCheckAt ? new Date(p.diagnostics.lastSuccessfulCheckAt).toLocaleTimeString() : 'Not reported'}<br />Request: {p.diagnostics.providerRequestId || p.action.id}</p>{p.diagnostics.events.map((event, index) => <p key={index}><time>{new Date(event.at).toLocaleTimeString()}</time> · {event.message}</p>)}</details>}{p.receipt?.asset && <><SandboxAction asset={{ ...p.receipt.asset, prompt: typeof args.direction === 'string' ? args.direction : undefined }} />{p.receipt.asset.kind === 'motion' ? <video src={p.receipt.asset.src} poster={p.receipt.asset.poster} controls /> : <img src={p.receipt.asset.src} alt={p.receipt.asset.title} />}<a href={p.receipt.asset.kind === 'motion' ? '#/activate/animate' : '#/activate/create'} onClick={() => { setStudioMissions(previous => ({ ...previous, selectedId: String(args.missionId), missions: previous.missions.map(item => item.id === args.missionId ? { ...item, draft: { ...item.draft, kind: p.receipt!.asset!.kind } } : item) })); setExpanded(false); setOpen(false); }}>Open project workspace</a>{p.state === 'done' && <button type="button" className="button secondary" disabled={busy || running || !status.available} onClick={() => void send(p.receipt!.asset!)}><ScanEye size={16} />Review result</button>}{p.state === 'done' && p.action.name.startsWith('generate_') && <button type="button" className="button secondary" disabled={busy || running} onClick={() => void regenerate(p)}><RefreshCw size={16} />Regenerate</button>}</>}</article>; })}</Fragment>)}

      {busy && <p role="status">Considering your request...</p>}{error && <p className="assistant-error" role="alert">{error}</p>}
    </div>
    {reviewEvidence && <details className="assistant-review-evidence"><summary>Visual evidence: {reviewEvidence.title}</summary><div>{reviewEvidence.images.map((frame, index) => <figure key={index}><img src={frame.image} alt={frame.label} /><figcaption>{frame.label}</figcaption></figure>)}</div>{reviewEvidence.notes.map(note => <p key={note}>{note}</p>)}</details>}
    <div className="assistant-attachment" aria-label="Asset attachment">{attached ? <><div className="attachment-preview">{attached.kind === 'still' ? <img src={attached.src} alt={attached.title} /> : <video src={attached.src} muted preload="metadata" />}</div><div><strong>{attached.title}</strong><span>Attached · Ask a question below</span></div><button className="icon-button" aria-label="Remove attachment" onClick={() => setReviewId('')}><X size={15} /></button></> : <span>Drop a Sandbox image or video here to discuss it.</span>}</div>
    {reviewProgress && <p className="assistant-review-progress" role="status"><span className="spinner" />{reviewProgress}</p>}
    <form className="assistant-composer" onSubmit={e => { e.preventDefault(); void send(); }}><textarea aria-label="Message AI Assistant" placeholder={status.available ? 'Describe what you want to create...' : 'Assistant not connected'} maxLength={6000} value={input} disabled={!status.available} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }} /><div><span role="status">{status.available ? 'Connected' : 'Assistant not connected'}</span><button type="button" className="icon-button" title="Refresh assistant connection" aria-label="Refresh assistant connection" onClick={() => void refresh()}><RefreshCw size={14} /></button><button className="icon-button assistant-send" title="Send message" aria-label="Send message" disabled={!status.available || busy || running || (!input.trim() && !attached)}><ArrowUp size={18} /></button></div></form><div className="assistant-disclaimer">AI output requires review.</div></>}
  </aside>;
}
