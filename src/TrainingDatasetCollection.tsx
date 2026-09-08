import PaginatedGallery from './PaginatedGallery';
import { galleryNavigation } from './galleryNavigation';
import { useState } from 'react';
import { ArrowDownToLine, ArrowLeft, ArrowRight, Expand, Film } from 'lucide-react';
import type { TrainingDataset, TrainingDatasetItem } from './data';
import { ImageViewer, Modal, VideoPlayer } from './Media';

const statusLabel = (status: string) => ({ RUNNING: 'Training in progress', PENDING: 'Queued', QUEUED: 'Queued', COMPLETED: 'Training complete / Evaluation pending', SUCCEEDED: 'Training complete / Evaluation pending', FAILED: 'Training failed', CANCELLED: 'Training cancelled' }[status] || status);
const timecode = (seconds: number) => `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(2).padStart(5, '0')}`;

export default function TrainingDatasetCollection({ dataset }: { dataset: TrainingDataset }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<TrainingDatasetItem | null>(null);
  const previews = ['flight-lateral-bank', 'hero-rise', 'palms-raised', 'takeoff-front'].map(id => dataset.items.find(item => item.id === id)).filter((item): item is TrainingDatasetItem => !!item);
  const show = (item: TrainingDatasetItem | null) => { setSelected(item); setOpen(true); };
  return <section className="derived-collection motion-training-collection" aria-label={dataset.name}>
    <div className="derived-row-heading"><div><span className="eyebrow"><Film size={13} />MOTION ADAPTATION DATASET</span><h3>{dataset.name}</h3></div><span className="version-label">v{dataset.version}</span></div>
    <div className="derived-metadata"><span>{dataset.videoCount} training clips</span><span>{dataset.imageCount} complementary stills</span><span>{dataset.holdoutCount} reserved clips</span></div>
    <div className="training-dataset-status"><span>{statusLabel(dataset.status)}</span><span>{dataset.model}</span>{dataset.progress && <span>{dataset.progress.current_step.toLocaleString()} / {dataset.progress.total_steps.toLocaleString()} steps</span>}</div>
    <div className="dataset-preview-strip motion-training-previews">{previews.map(item => <button key={item.id} className="video-thumb dataset-preview" aria-label={`Inspect ${item.title}`} onClick={() => show(item)}><img src={item.poster || item.src} alt={item.title} loading="lazy" /><span className="tile-open" title="Inspect clip"><Expand size={15} /></span></button>)}</div>
    <div className="dataset-footer"><span>Appearance and motion · Captioned source material</span><button className="text-button" onClick={() => show(null)}>Inspect training set <ArrowRight size={14} /></button></div>
    <div className="dataset-download"><a className="button secondary" href={dataset.download} download><ArrowDownToLine size={16} />Download training set</a><span>ZIP · {(dataset.bytes / 1024 / 1024).toFixed(1)} MB<br />Clips, stills, captions &amp; manifest</span></div>
    <details className="training-dataset-details"><summary>Dataset details</summary><p>{dataset.notes}</p><a href={dataset.sourceUrl} target="_blank" rel="noreferrer">Source video</a>{dataset.jobName && <p>Training job: {dataset.jobName}</p>}{dataset.lastCheckedAt && <p>Last verified: <time dateTime={dataset.lastCheckedAt}>{new Date(dataset.lastCheckedAt).toLocaleString()}</time>. Status snapshot, not a live feed.</p>}</details>
    {open && <Modal navigation={galleryNavigation(dataset.items, selected?.id, setSelected)} title={selected?.title || dataset.name} subtitle={selected ? `${selected.split === 'holdout' ? 'Reserved / Not used for training' : 'Training source'} · ${selected.kind === 'motion' ? 'Video' : 'Still image'}` : `${dataset.videoCount} training clips · ${dataset.imageCount} stills · ${dataset.holdoutCount} reserved clips`} wide onClose={() => { setOpen(false); setSelected(null); }}>
      {selected ? <><div className="dataset-back"><button className="text-button" onClick={() => setSelected(null)}><ArrowLeft size={14} />Back to training set</button></div>{selected.kind === 'motion' ? <VideoPlayer key={selected.id} clip={{ ...selected, poster: selected.poster || '', duration: selected.duration || 0 }} autoPlay /> : <ImageViewer key={selected.id} item={{ ...selected, variant: 'Training source' }} />}<div className="dataset-caption"><span className="eyebrow">{selected.split === 'holdout' ? 'RESERVED CAPTION' : 'TRAINING CAPTION'}</span><p>{selected.caption}</p>{selected.sourceStartSeconds !== undefined && selected.sourceEndSeconds !== undefined && <p>Source interval: {timecode(selected.sourceStartSeconds)}–{timecode(selected.sourceEndSeconds)}</p>}</div></> : <PaginatedGallery className="dataset-catalog motion-training-catalog" label="Training collection">{dataset.items.map(item => <button className="canon-tile" key={item.id} onClick={() => setSelected(item)}><div className="canon-image"><img src={item.poster || item.src} alt={item.title} loading="lazy" /><span className="tile-open" title="Inspect source"><Expand size={16} /></span></div><div className="tile-caption"><strong>{item.title}</strong><span>{item.split === 'holdout' ? 'Reserved / Not trained' : item.kind === 'motion' ? `${item.duration?.toFixed(2)}s · Training clip` : 'Training still'}</span></div></button>)}</PaginatedGallery>}
    </Modal>}
  </section>;
}
