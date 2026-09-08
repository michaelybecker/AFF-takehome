import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Expand, Image as ImageIcon, Maximize2, Pause, Play, Volume2, VolumeX, X, ZoomIn, ZoomOut } from 'lucide-react';
import { clipTitle, clock, frameSrc, passNames, passes, type Canon, type Clip, type Pass, type Still } from './data';

export function IconButton({ label, children, onClick, active = false, disabled = false }: { label: string; children: ReactNode; onClick?: () => void; active?: boolean; disabled?: boolean }) {
  return <button className={`icon-button ${active ? 'active' : ''}`} type="button" title={label} aria-label={label} onClick={onClick} disabled={disabled}>{children}</button>;
}

type GalleryNavigation = { position: number; total: number; previous: () => void; next: () => void };
const GalleryContext = createContext<GalleryNavigation | undefined>(undefined);
function GalleryArrows() {
  const navigation = useContext(GalleryContext);
  return navigation ? <nav className="gallery-navigation" aria-label="Gallery navigation"><IconButton label="Previous item" onClick={navigation.previous}><ChevronLeft /></IconButton><IconButton label="Next item" onClick={navigation.next}><ChevronRight /></IconButton></nav> : null;
}
function GalleryCount() {
  const navigation = useContext(GalleryContext);
  return navigation ? <span className="gallery-count" aria-live="polite">{navigation.position} / {navigation.total}</span> : null;
}
export function Modal({ title, subtitle, children, onClose, wide = false, navigation }: { title: string; subtitle?: string; children: ReactNode; onClose: () => void; wide?: boolean; navigation?: GalleryNavigation }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!navigation || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || !(event.target instanceof Element) || event.target.closest('input, textarea, select, video, [contenteditable=true]')) return;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        if (event.key === 'ArrowLeft') navigation.previous(); else navigation.next();
      }
    };
    const node = dialog.current;
    node?.addEventListener('keydown', onKey);
    return () => node?.removeEventListener('keydown', onKey);
  }, [navigation]);
  useEffect(() => {
    const focused = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; focused?.focus(); };
  }, []);
  return <dialog ref={dialog} aria-label={title} className={`modal ${wide ? 'wide' : ''}`} onCancel={e => { e.preventDefault(); onClose(); }} onClick={e => { if (e.target === dialog.current) { const r = dialog.current!.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) onClose(); } }}>
    <header className="modal-heading"><div><span className="eyebrow">MARVEL STUDIOS / GENERATIVE IDENTITY KIT</span><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><IconButton label="Close viewer" onClick={onClose}><X /></IconButton></header>
    <GalleryContext.Provider value={navigation}>{children}</GalleryContext.Provider>
  </dialog>;
}

export function VideoTile({ clip, onOpen, selected = false, onSelect, description }: { clip: Clip; onOpen: (clip: Clip) => void; selected?: boolean; onSelect?: () => void; description?: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const [progress, setProgress] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [hovered, setHovered] = useState(false);
  return <article className={`media-tile ${selected ? 'selected' : ''}`}>
    <button className="video-thumb" aria-label={`${clipTitle(clip)}. Open video`} onClick={() => onOpen(clip)}
      onPointerEnter={() => { setHovered(true); if (video.current) { video.current.preload = 'auto'; if (video.current.readyState < 1) video.current.load(); } }}
      onPointerLeave={() => { setHovered(false); video.current?.pause(); }}
      onPointerMove={e => { if (e.pointerType === 'touch') return; const r = e.currentTarget.getBoundingClientRect(); const p = Math.min(.999, Math.max(0, (e.clientX - r.left) / r.width)); setProgress(p); const v = video.current; if (v && v.readyState >= 1 && Number.isFinite(v.duration)) v.currentTime = p * v.duration; }}>
      <img src={clip.poster} alt="" loading="lazy" draggable={false} />
      <video ref={video} src={clip.src} muted playsInline preload="none" className={loaded ? 'loaded' : ''} onSeeked={() => setLoaded(true)} />
      <span className="clip-duration">{clock(clip.duration)}</span><span className="clip-type"><Play size={11} fill="currentColor" /> VIDEO</span>
      <span className="tile-open" title="Open video"><Expand size={16} /></span>
      <div className={`hover-timeline ${hovered ? 'visible' : ''}`}><i style={{ width: `${progress * 100}%` }} /></div>
    </button>
    <div className="tile-caption"><strong>{clipTitle(clip)}</strong><span>{description || (clip.id.startsWith('Hero') ? 'Campaign candidate' : /Nano|Mask/.test(clip.id) ? 'Variant reference' : 'Production reference')}</span></div>
    {onSelect && <button className="text-button select-clip" onClick={onSelect}>{selected ? 'Current clip' : 'Use clip'}</button>}
  </article>;
}

export function StillTile<T extends Pick<Still, 'title' | 'src' | 'variant'>>({ item, onOpen }: { item: T; onOpen: (item: T) => void }) {
  return <article className="media-tile">
    <button className="video-thumb still-thumb" aria-label={`${item.title}. Open still`} onClick={() => onOpen(item)}>
      <img src={item.src} alt={item.title} loading="lazy" draggable={false} />
      <span className="clip-type"><ImageIcon size={11} /> STILL</span>
      <span className="tile-open" title="Open still"><Expand size={16} /></span>
    </button>
    <div className="tile-caption"><strong>{item.title}</strong><span>{item.variant}</span></div>
  </article>;
}

export function VideoPlayer({ clip, autoPlay = false, onExpand }: { clip: Clip; autoPlay?: boolean; onExpand?: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(autoPlay);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(clip.duration);
  const [volume, setVolume] = useState(0);
  const [error, setError] = useState('');
  useEffect(() => { const v = video.current!; v.muted = true; if (autoPlay) v.play().catch(() => setPlaying(false)); return () => v.pause(); }, [clip.src, autoPlay]);
  const toggle = () => { const v = video.current!; if (v.paused) v.play().catch(() => setError('Playback could not start. Try again.')); else v.pause(); };
  const expand = () => { video.current?.pause(); onExpand?.(); };
  return <div className="player" ref={root}>
    <video ref={video} src={clip.src} poster={clip.poster} playsInline preload="metadata" onClick={onExpand ? expand : toggle} onTimeUpdate={e => setTime(e.currentTarget.currentTime)} onLoadedMetadata={e => setDuration(e.currentTarget.duration)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} onError={() => setError('This video could not be loaded.')} />
    {onExpand ? <button className="tile-open" title="Open source video" aria-label="Open source video" onClick={expand}><Expand size={16} /></button> : !playing && <button className="center-play" aria-label={`Play ${clipTitle(clip)}`} onClick={toggle}><Play fill="currentColor" /></button>}
    <GalleryArrows />
    {error && <p className="player-error" role="alert">{error}</p>}
    <div className="player-controls"><IconButton label={playing ? 'Pause' : 'Play'} onClick={toggle}>{playing ? <Pause /> : <Play />}</IconButton><span className="timecode">{clock(time)}</span><input aria-label="Playback position" type="range" min="0" max={duration || 1} step="0.01" value={time} onChange={e => { const t = Number(e.target.value); video.current!.currentTime = t; setTime(t); }} /><span className="timecode">{clock(duration)}</span>
      <IconButton label={volume ? 'Mute' : 'Unmute'} onClick={() => { const next = volume ? 0 : .7; setVolume(next); video.current!.muted = next === 0; video.current!.volume = next; }}>{volume ? <Volume2 /> : <VolumeX />}</IconButton>
      <input className="volume" type="range" aria-label="Volume" min="0" max="1" step="0.05" value={volume} onChange={e => { const n = Number(e.target.value); setVolume(n); video.current!.volume = n; video.current!.muted = n === 0; }} />
      <GalleryCount /><IconButton label="Fullscreen" onClick={() => { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); else root.current?.requestFullscreen().catch(() => {}); }}><Maximize2 /></IconButton>
    </div>
  </div>;
}

const preloaded = new Set<Pass>();
function preload(pass: Pass) { if (preloaded.has(pass)) return; preloaded.add(pass); for (let i = 0; i < 48; i++) { const img = new Image(); img.src = frameSrc(pass, i); } }

export function PassTile({ pass, frame, onOpen }: { pass: Pass; frame: number; onOpen: (p: Pass, frame: number) => void }) {
  const [hovered, setHovered] = useState(false);
  const [previewFrame, setPreviewFrame] = useState(frame);
  useEffect(() => {
    if (!hovered) return;
    const interval = setInterval(() => setPreviewFrame(f => (f + 1) % 48), 100);
    return () => clearInterval(interval);
  }, [hovered]);
  const displayedFrame = hovered ? previewFrame : frame;
  return <button className={`pass-tile pass-${pass}`} onPointerEnter={e => { preload(pass); if (e.pointerType !== 'touch') { setPreviewFrame(frame); setHovered(true); } }} onPointerLeave={() => setHovered(false)} onPointerMove={e => { if (e.pointerType === 'touch') return; const r = e.currentTarget.getBoundingClientRect(); setPreviewFrame(Math.max(0, Math.min(47, Math.floor((e.clientX - r.left) / r.width * 48)))); }} onClick={() => { setHovered(false); onOpen(pass, displayedFrame); }} aria-label={`Open ${passNames[pass]} turntable`}>
    <img src={frameSrc(pass, displayedFrame)} alt={`${passNames[pass]}, view ${displayedFrame + 1}`} draggable={false} /><span className="pass-label">{passNames[pass]}</span><span className="tile-open" title="Open turntable"><Expand size={16} /></span><span className="pass-frame">{String(displayedFrame + 1).padStart(2, '0')} / 48</span><i className="pass-progress" style={{ width: `${(displayedFrame + 1) / 48 * 100}%` }} />
  </button>;
}

export function Turntable({ initialPass, frame, onFrame }: { initialPass: Pass; frame: number; onFrame: (n: number) => void }) {
  const [pass, setPass] = useState(initialPass);
  const [playing, setPlaying] = useState(true);
  const frameRef = useRef(frame);
  frameRef.current = frame;
  useEffect(() => { passes.forEach(preload); }, []);
  useEffect(() => { if (!playing) return; const interval = setInterval(() => onFrame((frameRef.current + 1) % 48), 100); return () => clearInterval(interval); }, [playing, onFrame]);
  return <div className="turntable"><div className="segmented">{passes.map(p => <button key={p} className={p === pass ? 'active' : ''} onClick={() => setPass(p)}>{passNames[p]}</button>)}</div><div className="turntable-stage"><img src={frameSrc(pass, frame)} alt={`${passNames[pass]} view ${frame + 1}`} /></div><div className="player-controls"><IconButton label={playing ? 'Pause turntable' : 'Play turntable'} onClick={() => setPlaying(!playing)}>{playing ? <Pause /> : <Play />}</IconButton><input aria-label="Turntable frame" type="range" min="0" max="47" value={frame} onChange={e => { setPlaying(false); onFrame(Number(e.target.value)); }} /><span className="timecode">{String(frame + 1).padStart(2, '0')} / 48</span><span className="angle">{Math.round(frame * 7.5)}°</span></div></div>;
}

export function ImageViewer({ item }: { item: Pick<Canon, 'src' | 'title' | 'variant'> }) {
  const [zoom, setZoom] = useState(1);
  return <><div className="gallery-stage"><div className="image-stage"><img src={item.src} alt={item.title} style={{ width: `${zoom * 100}%`, maxWidth: zoom === 1 ? '100%' : 'none', maxHeight: zoom === 1 ? '65vh' : 'none' }} /></div><GalleryArrows /></div><div className="player-controls"><span>{item.variant}</span><span className="spacer" /><GalleryCount /><IconButton label="Zoom out" disabled={zoom <= 1} onClick={() => setZoom(Math.max(1, zoom - .5))}><ZoomOut /></IconButton><span>{Math.round(zoom * 100)}%</span><IconButton label="Zoom in" disabled={zoom >= 3} onClick={() => setZoom(Math.min(3, zoom + .5))}><ZoomIn /></IconButton></div></>;
}
