import PaginatedGallery from './PaginatedGallery';
import { galleryNavigation } from './galleryNavigation';
import { lazy, Suspense, useEffect, useState } from 'react';
import { ArrowDownToLine, ArrowRight, Box, ChevronDown, ChevronRight, CircleHelp, Clapperboard, Expand, ExternalLink, Fingerprint, Image as ImageIcon, Layers3, ListChecks, Search, ShieldCheck, Sparkles, WandSparkles } from 'lucide-react';
import { clipTitle, passNames, passes, sectionLinks, type Canon, type Clip, type Manifest, type Pass, type Still } from './data';
import { IconButton, ImageViewer, Modal, PassTile, StillTile, Turntable, VideoPlayer, VideoTile } from './Media';
import Activate from './Activate';
import StudioAssistant from './StudioAssistant';
import ConnectionCheck from './ConnectionCheck';
import DerivedIdentity from './DerivedIdentity';
import { refreshExplorations } from './assistant-bridge';
import type { Mode } from './provider';
const ModelViewer = lazy(() => import('./ModelViewer'));
type Viewer = { type: 'video'; clip: Clip } | { type: 'image'; item: Canon } | { type: 'still'; item: Still } | { type: 'pass'; pass: Pass } | { type: 'about' } | { type: 'package' } | null;
type ExpressionAsset = { type: 'video'; item: Clip } | { type: 'still'; item: Still };

function readRoute() { const hash = location.hash.replace('#/activate/adapt', '#/activate/deliver'); return hash.startsWith('#/activate') ? { page: 'activate', mode: (hash === '#/activate/deliver' ? 'deliver' : hash === '#/activate/animate' ? 'animate' : 'create') as Mode } : { page: 'identity', mode: 'create' as Mode }; }

export default function App() {
  const [route, setRoute] = useState(readRoute);
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [viewer, setViewer] = useState<Viewer>(null);
  const [frame, setFrame] = useState(0);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [mediaType, setMediaType] = useState('all');
  const [activeSection, setActiveSection] = useState('source');
  const [savedToast, setSavedToast] = useState('');
  const [accountOpen, setAccountOpen] = useState(false);
  useEffect(() => { void refreshExplorations().catch(() => setSavedToast('The saved Sandbox state could not be loaded.')); }, []);
  useEffect(() => { const changed = () => { if (location.hash === '#/activate/adapt') history.replaceState(null, '', '#/activate/deliver'); if (location.hash.startsWith('#/activate') && !['#/activate/create', '#/activate/animate', '#/activate/deliver'].includes(location.hash)) history.replaceState(null, '', '#/activate/create'); setRoute(readRoute()); window.scrollTo(0, 0); }; changed(); window.addEventListener('hashchange', changed); return () => window.removeEventListener('hashchange', changed); }, []);
  useEffect(() => { fetch('/media/manifest.json').then(r => { if (!r.ok) throw new Error(); return r.json(); }).then(setManifest).catch(() => setLoadError(true)); }, []);
  useEffect(() => {
    if (!accountOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setAccountOpen(false); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [accountOpen]);
  useEffect(() => {
    if (route.page !== 'identity' || !manifest) return;
    const observer = new IntersectionObserver(entries => { const visible = entries.filter(e => e.isIntersecting); if (visible.length) setActiveSection(visible[0].target.id); }, { rootMargin: '-110px 0px -55% 0px' });
    sectionLinks.forEach(s => { const section = document.getElementById(s.id); if (section) observer.observe(section); });
    return () => observer.disconnect();
  }, [route.page, manifest]);
  const openClip = (clip: Clip) => setViewer({ type: 'video', clip });
  const stills = manifest?.stills || [];
  const expression: ExpressionAsset[] = [];
  for (let i = 0; i < Math.max(manifest?.clips.length || 0, stills.length); i++) {
    if (stills[i]) expression.push({ type: 'still', item: stills[i] });
    if (manifest?.clips[i]) expression.push({ type: 'video', item: manifest.clips[i] });
  }
  const filtered = expression.filter(asset => {
    const title = asset.type === 'video' ? clipTitle(asset.item) : asset.item.title;
    const category = asset.type === 'still' ? asset.item.category : asset.item.id.startsWith('Hero') ? 'hero' : 'reference';
    return title.toLowerCase().includes(query.trim().toLowerCase()) && (filter === 'all' || category === filter) && (mediaType === 'all' || asset.type === mediaType);
  });
  const assets = filtered;
  const expressionNavigation = galleryNavigation(filtered.map(asset => ({ ...asset, id: asset.item.id })), viewer?.type === 'video' ? viewer.clip.id : viewer?.type === 'still' ? viewer.item.id : undefined, asset => setViewer(asset.type === 'video' ? { type: 'video', clip: asset.item } : { type: 'still', item: asset.item }));
  const canonNavigation = galleryNavigation(manifest?.canon || [], viewer?.type === 'image' ? viewer.item.id : undefined, item => setViewer({ type: 'image', item }));
  const exportPackage = () => { const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' }); const href = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = href; a.download = 'iron-man-mark-iii-package.json'; a.click(); setTimeout(() => URL.revokeObjectURL(href), 1000); setSavedToast('Package manifest downloaded'); };
  return <>
    <header className="app-header">
      <a className="brand-lockup" href="#/identity" aria-label="Generative Pipeline home"><img src="/media/brand/marvel-studios.jpg" alt="Marvel Studios" /><span className="brand-divider" /><strong>Generative Pipeline</strong></a>
      <nav className="primary-nav" aria-label="Main navigation"><a href="#/identity" aria-current={route.page === 'identity' ? 'page' : undefined} className={route.page === 'identity' ? 'active' : ''}>IDENTITY</a>{(['create', 'animate', 'deliver'] as Mode[]).map(m => <a key={m} href={'#/activate/' + m} aria-current={route.page === 'activate' && route.mode === m ? 'page' : undefined} className={route.page === 'activate' && route.mode === m ? 'active' : ''}>{m.toUpperCase()}</a>)}</nav>
      <div className="powered"><img src="/media/brand/firefly.svg" alt="" /><span>Powered by <strong>Firefly Foundry</strong></span></div>
      <IconButton label="About Generative Pipeline" onClick={() => { setAccountOpen(false); setViewer({ type: 'about' }); }}><CircleHelp /></IconButton>
      <div className="account-menu-wrap">
        <button className="user-profile" aria-label="Michael Becker account" aria-haspopup="dialog" aria-expanded={accountOpen} title="Michael Becker" onClick={() => setAccountOpen(open => !open)}><span className="adobe-avatar user-avatar" aria-hidden="true" /></button>
        {accountOpen && <>
          <button className="account-dismiss" aria-label="Close account menu" onClick={() => setAccountOpen(false)} />
          <section className="account-popover" role="dialog" aria-label="Michael Becker account">
            <div className="account-identity"><span className="adobe-avatar account-avatar" aria-hidden="true" /><div><strong>Michael Becker</strong><span>Marvel Studios workspace</span><button type="button" className="account-link">Manage account</button></div></div>
            <span className="account-section-label">GENERATIVE PIPELINE</span>
            <div className="account-access-card"><div className="account-access-title"><WandSparkles size={17} /><strong>Generative AI</strong><ExternalLink size={14} /></div><p>Identity-aware generation is enabled for this workspace.</p><span className="account-entitlement"><ShieldCheck size={14} /> Authorized</span></div>
            <button type="button" className="account-row">Preferences</button>
            <button type="button" className="account-row account-sign-out">Sign out</button>
          </section>
        </>}
      </div>
    </header>
    <aside className="sidebar"><div className="workspace-label">WORKSPACE</div><div className="workspace-name"><span className="workspace-avatar"><img src="/media/brand/marvel-studios.jpg" alt="Marvel Studios" /></span><div><strong>Marvel Studios</strong><span>The Walt Disney Company</span></div></div><div className="sidebar-separator" /><div className="library-heading"><span>IDENTITY LIBRARY</span><span>01</span></div><a className="active-identity" href="#/identity"><div className="identity-thumb"><img src="/media/passes/beauty/0001.webp" alt="" /></div><div><strong>Iron Man</strong><span>Mark III</span></div><ChevronRight size={14} /></a>
      <div className="sidebar-links">{route.page === 'identity' ? sectionLinks.map((s, index) => { const Icon = [Box, Clapperboard, ImageIcon, ListChecks, Sparkles][index]; return <button key={s.id} className={activeSection === s.id ? 'active' : ''} onClick={() => { document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); setActiveSection(s.id); }}><Icon size={15} /><span>{s.label}</span></button>; }) : (route.mode === 'deliver' ? [{ id: 'project-brief', label: 'Project brief' }, { id: 'delivery-family', label: 'Delivery formats' }, { id: 'generated-adaptations', label: 'Prepared formats' }] : [{ id: 'project-brief', label: 'Project brief' }, { id: 'sandbox', label: 'Sandbox' }]).map(s => <button key={s.id} onClick={() => document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}><span>{s.label}</span></button>)}</div>
      <div className="sidebar-bottom"><span className="status amber">Package assembled</span><div>Identity kit <span>v{manifest?.version || '0.2.0'}</span></div><button onClick={() => setViewer({ type: 'about' })}>Case-study prototype <CircleHelp size={13} /></button></div>
    </aside>
    <main>{loadError ? <div className="load-state"><h1>Identity package unavailable</h1><p>The media manifest could not be loaded.</p><button className="button primary" onClick={() => location.reload()}>Try again</button></div> : !manifest ? <div className="load-state"><span className="spinner" />Loading identity package</div> : route.page === 'activate' ? <Activate mode={route.mode} manifest={manifest} /> : <>
      <div className="breadcrumbs">Marvel Studios <span>/</span> Identity library <span>/</span> Iron Man</div>
      <div className="page-heading"><div><span className="eyebrow">GENERATIVE IDENTITY</span><h1>Iron Man <span className="title-slash">/</span> Mark III</h1><p className="subheading">Canonical Identity Kit</p></div><div className="heading-actions"><button className="button secondary" onClick={() => setViewer({ type: 'package' })}><Layers3 size={16} />View package</button><a className="button primary" href="#/activate/create">Create <ArrowRight size={16} /></a></div></div>
      <div className="identity-summary"><span><Fingerprint size={15} />Character identity</span><span><Box size={15} />48 canonical views</span><span><Clapperboard size={15} />{manifest.clips.length} clips · {stills.length} production stills</span><span><ImageIcon size={15} />{manifest.canon.length} design references</span><span className="status amber">Review pending</span></div>
      <section id="source" className="source-section"><SectionHeading number="01" title="Authoritative asset representation" subtitle="Geometry, materials, and canonical coverage" trailing={<span className="quiet-label">SOURCE PACKAGE <strong>v{manifest.version}</strong></span>} />
        <div className="source-layout"><Suspense fallback={<div className="model-viewer load-state"><span className="spinner" />Loading 3D viewer</div>}><ModelViewer /></Suspense><div className="canonical-area"><div className="canonical-heading"><span>Canonical passes</span><span>360° <span className="muted-dot">·</span> 48 views</span></div><div className="pass-grid">{passes.map(p => <PassTile key={p} pass={p} frame={frame} onOpen={(pass, previewFrame) => { setFrame(previewFrame); setViewer({ type: 'pass', pass }); }} />)}</div><div className="canonical-footer"><span>VIEW {String(frame + 1).padStart(2, '0')} / 48</span><input aria-label="Canonical view angle" type="range" min="0" max="47" value={frame} onChange={e => setFrame(Number(e.target.value))} /><span>{Math.round(frame * 7.5)}°</span></div></div></div>
        <div className="source-details"><div><span>Asset</span><strong>Production hero analogue</strong></div><div><span>Master representation</span><strong>Multilayer OpenEXR</strong></div><div><span>Canonical resolution</span><strong>1024 × 1024</strong></div><div><span>Structural signals</span><strong>Alpha · Depth · Normals</strong></div></div>
      </section>
      <section id="expression">
        <SectionHeading number="02" title="Approved Expression" subtitle="Production observations across performance, light, and framing" trailing={<span className="count-label">{manifest.clips.length} clips · {stills.length} stills</span>} />
        <div className="media-filter">
          <label className="search-box"><Search size={16} /><input placeholder="Search production assets" aria-label="Search production assets" value={query} onChange={e => setQuery(e.target.value)} /></label>
          <select aria-label="Asset type" value={mediaType} onChange={e => setMediaType(e.target.value)}><option value="all">All media</option><option value="video">Videos</option><option value="still">Stills</option></select>
          <select aria-label="Asset category" value={filter} onChange={e => setFilter(e.target.value)}><option value="all">All categories</option><option value="hero">Campaign candidates</option><option value="reference">Expression references</option></select>
          <span className="spacer" /><span className="quiet-label">{filtered.length} ASSETS</span>
        </div>
        <PaginatedGallery className="clip-grid" label="Approved Expression" scope={query + filter + mediaType}>{assets.map(asset => asset.type === 'video' ? <VideoTile key={`video-${asset.item.id}`} clip={asset.item} onOpen={openClip} /> : <StillTile key={`still-${asset.item.id}`} item={asset.item} onOpen={item => setViewer({ type: 'still', item })} />)}</PaginatedGallery>
        {!assets.length && <div className="empty-search">No assets match the current filters. <button className="text-button" onClick={() => { setQuery(''); setFilter('all'); setMediaType('all'); }}>Clear filters</button></div>}
      </section>
      <section id="canon"><SectionHeading number="03" title="Creative Canon" subtitle="Design intent, silhouette, and visual development" trailing={<span className="count-label">{manifest.canon.length} references</span>} /><PaginatedGallery className="canon-grid" label="Creative Canon">{manifest.canon.map((item, i) => <button className="canon-tile" key={item.id} onClick={() => setViewer({ type: 'image', item })}><div className="canon-image"><img src={item.src} alt={item.title} loading="lazy" /><span className="reference-index">{String(i + 1).padStart(2, '0')}</span><span className="tile-open" title="Open image"><Expand size={16} /></span></div><div className="tile-caption"><strong>{item.title}</strong><span>{item.variant} <span className="muted-dot">·</span> Review pending</span></div></button>)}</PaginatedGallery></section>
      <section id="semantic"><SectionHeading number="04" title="Semantic Canon" subtitle="The facts and constraints that define the identity" trailing={<ShieldCheck size={18} />} /><div className="semantic-grid"><div><span className="eyebrow">CHARACTER</span><h3>Tony Stark</h3><dl><div><dt>Identity</dt><dd>Iron Man</dd></div><div><dt>Armor</dt><dd>Mark III</dd></div><div><dt>Franchise</dt><dd>Marvel / Iron Man</dd></div></dl></div><div><span className="eyebrow">VISUAL INVARIANTS</span><ul>{['Red and gold armor', 'Circular chest arc reactor', 'Illuminated eye slits', 'Metallic armored construction'].map(t => <li key={t}><ShieldCheck size={14} />{t}</li>)}</ul></div><div><span className="eyebrow">CHARACTER & CAPABILITY</span><ul>{['Ingenious, self-confident, resourceful', 'Powered flight', 'Repulsor technology', 'Enhanced strength'].map(t => <li key={t}>{t}</li>)}</ul></div></div><div className="canon-guidance"><LockLabel /> <span>Preserve armor identity and the circular reactor. Unapproved redesigns remain outside canon.</span></div></section>
<section id="derived"><SectionHeading number="05" title="Generative Identity" subtitle="Learned identity and generated sample results" /><DerivedIdentity record={manifest.derived} /></section>
      <footer className="page-footer"><span>Marvel Studios <span className="muted-dot">/</span> Generative Pipeline</span><span>Identity kit v{manifest.version}</span></footer>
    </>}</main>
    {manifest && <StudioAssistant manifest={manifest} route={route.page === 'identity' ? 'identity' : route.mode} />}
    {viewer?.type === 'video' && <Modal navigation={expressionNavigation} title={clipTitle(viewer.clip)} subtitle={`${viewer.clip.id} · Production reference`} wide onClose={() => setViewer(null)}><VideoPlayer key={viewer.clip.id} clip={viewer.clip} autoPlay /></Modal>}
    {viewer?.type === 'pass' && <Modal title="Canonical turntable" subtitle={`${passNames[viewer.pass]} · 48 views · Iron Man / Mark III`} wide onClose={() => setViewer(null)}><Turntable initialPass={viewer.pass} frame={frame} onFrame={setFrame} /></Modal>}
    {viewer?.type === 'image' && <Modal navigation={canonNavigation} title={viewer.item.title} subtitle="Creative Canon · Review pending" wide onClose={() => setViewer(null)}><ImageViewer key={viewer.item.id} item={viewer.item} /></Modal>}
    {viewer?.type === 'still' && <Modal navigation={expressionNavigation} title={viewer.item.title} subtitle={`Approved Expression · Production still · ${viewer.item.width} × ${viewer.item.height}`} wide onClose={() => setViewer(null)}><ImageViewer key={viewer.item.id} item={viewer.item} /></Modal>}
    {viewer?.type === 'package' && manifest && <Modal title="Identity package" subtitle="Iron Man / Mark III" onClose={() => { setViewer(null); setSavedToast(''); }}><div className="modal-copy"><dl className="package-list"><div><dt>Version</dt><dd>{manifest.version}</dd></div><div><dt>Source asset</dt><dd>Portable GLB</dd></div><div><dt>Canonical coverage</dt><dd>48 views / 4 passes</dd></div><div><dt>Production observations</dt><dd>{manifest.clips.length} clips · {stills.length} stills</dd></div><div><dt>Creative references</dt><dd>{manifest.canon.length} unique images</dd></div><div><dt>Source review</dt><dd>Pending</dd></div><div><dt>Adaptation collection</dt><dd>{manifest.derived ? `${manifest.derived.dataset.imageCount} image/caption pairs` : 'Pending'}</dd></div><div><dt>Learned capability</dt><dd>{manifest.derived?.adaptation.status || 'Pending R&D'}</dd></div></dl><button className="button primary" onClick={exportPackage}><ArrowDownToLine size={16} />Download manifest</button><p role="status">{savedToast}</p></div></Modal>}
    {viewer?.type === 'about' && <Modal title="Generative Pipeline" subtitle="Powered by Firefly Foundry" onClose={() => setViewer(null)}><div className="modal-copy"><p>Interview case-study prototype. Hypothetical engagement for The Walt Disney Company, piloted with Marvel Studios.</p><p>The signed-in local profile can use live still and motion services while their configured providers are available. The Krea identity adaptation is trained and selected for CREATE; generated drafts still require creative review.</p><p>Production footage and design references are demonstration material; their inclusion does not imply studio approval. Alternate armor references remain labeled for review.</p><p className="muted">Neutral studio lighting: Studio Small 09, Poly Haven (CC0).</p><ConnectionCheck /></div></Modal>}
  </>;
}

function LockLabel() { return <ShieldCheck size={16} />; }
function SectionHeading({ number, title, subtitle, trailing }: { number: string; title: string; subtitle: string; trailing?: React.ReactNode }) { return <div className="section-heading"><div><span className="section-number">{number}</span><div><h2>{title}</h2><p>{subtitle}</p></div></div>{trailing}</div>; }
