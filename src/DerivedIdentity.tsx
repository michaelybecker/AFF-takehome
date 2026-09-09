import PaginatedGallery from './PaginatedGallery';
import { galleryNavigation } from './galleryNavigation';
import { useState } from 'react';
import { ArrowDownToLine, ArrowLeft, ArrowRight, Database, Expand } from 'lucide-react';
import type { DatasetItem, DerivedIdentityRecord } from './data';
import { ImageViewer, Modal, VideoTile, VideoPlayer } from './Media';
import TrainingDatasetCollection from './TrainingDatasetCollection';
import './derived-identity.css';

const displayDate = (value: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(value));

export default function DerivedIdentity({ record }: { record?: DerivedIdentityRecord }) {
  const [collectionOpen, setCollectionOpen] = useState(false);
  const [selected, setSelected] = useState<DatasetItem | null>(null);
  const [sample, setSample] = useState<NonNullable<DerivedIdentityRecord['sampleResults']>[number] | null>(null);
  if (!record) return <div className="derived-pending">Adaptation collection not yet registered.</div>;
  const { dataset, adaptation } = record;
  const samples = record.sampleResults || [];
  const showcaseCount = samples.filter(item => item.selectedForShowcase).length;
  const openItem = (item: DatasetItem) => { setSelected(item); setCollectionOpen(true); };
  const previews = ['60b', '61b', 'movie2', 'movie12'].map(id => dataset.items.find(item => item.id === id)).filter((item): item is DatasetItem => !!item);
  return <>
    <section className="derived-samples" aria-label="Sample results">
      <div className="derived-samples-heading"><h3>Sample results</h3><span className="count-label">{samples.length} samples · {showcaseCount ? `${showcaseCount} showcase selection` : 'Creative review pending'}</span></div>
      {samples.length ? <PaginatedGallery className="derived-sample-grid" label="Sample results" pageSize={9}>{samples.map(item => item.kind === 'motion' ? <VideoTile key={item.id} clip={{ ...item, poster: item.poster || '', duration: item.duration || 0 }} onOpen={() => setSample(item)} description="Motion study" /> : <button className="canon-tile" key={item.id} onClick={() => setSample(item)} aria-label={`Open ${item.title}`}><div className="canon-image"><img src={item.src} alt={item.title} loading="lazy" /><span className="tile-open" title="Maximize"><Expand size={16} /></span></div><div className="tile-caption"><strong>{item.title}</strong><span>{item.selectedForShowcase ? 'Showcase selection' : 'Generated draft'}</span></div></button>)}</PaginatedGallery> : <p className="derived-pending">Sample results pending.</p>}
    </section>
    <details className="derived-inspector"><summary>Training datasets</summary>
      <div className="derived-collection">
        <div className="derived-row-heading"><div><span className="eyebrow"><Database size={13} />STILL ADAPTATION DATASET</span><h3>Mark III - Still Training Set</h3></div><span className="version-label">v{dataset.version}</span></div>
        <div className="derived-metadata"><span>{dataset.imageCount} images</span><span>{dataset.captionCount} captions</span><time dateTime={dataset.capturedAt}>{displayDate(dataset.capturedAt)}</time></div>
        <dl className="package-list" aria-label="Still training runs">{record.stillTrainingRuns?.map(run => <div key={run.id}><dt>{run.name}</dt><dd><strong>{run.role}</strong> · Checkpoint {run.checkpoint}<br />{run.details}</dd></div>)}</dl>
        <div className="dataset-preview-strip">{previews.map(item => <button key={item.id} className="video-thumb dataset-preview" aria-label={`Inspect ${item.title}`} onClick={() => openItem(item)}><img src={item.src} alt={item.title} loading="lazy" /><span className="tile-open" title="Inspect source"><Expand size={15} /></span></button>)}</div>
        <div className="dataset-footer"><span>Source kit v{dataset.sourceKitVersion} · Model-independent sources</span><button className="text-button" onClick={() => { setSelected(null); setCollectionOpen(true); }}>Inspect collection <ArrowRight size={14} /></button></div>
        <div className="dataset-download"><a className="button secondary" href={dataset.download} download><ArrowDownToLine size={16} />Download dataset</a><span>ZIP · {(dataset.bytes / 1024 / 1024).toFixed(1)} MB<br />Images, captions &amp; manifest</span></div>
      </div>
      {record.trainingDatasets?.map(training => <TrainingDatasetCollection key={training.id} dataset={training} />)}
    </details>
    <details className="derived-inspector"><summary>Technical details</summary><dl className="package-list">
      <div><dt>Adaptation</dt><dd>{adaptation.name} · v{adaptation.version}</dd></div>
      <div><dt>Selected checkpoint</dt><dd>{adaptation.selectedCheckpoint || 'Pending'}</dd></div><div><dt>Evaluation</dt><dd>{adaptation.evaluationStatus}</dd></div>
      <div><dt>Adaptation ID</dt><dd>{adaptation.id}</dd></div><div><dt>Base model</dt><dd>{adaptation.baseModel}</dd></div><div><dt>Trainer</dt><dd>{adaptation.trainer}</dd></div><div><dt>Training job</dt><dd>{adaptation.jobName}</dd></div><div><dt>Trigger</dt><dd>{dataset.trigger}</dd></div><div><dt>Weights</dt><dd>{adaptation.weightsStatus}</dd></div><div><dt>Status source</dt><dd>{adaptation.statusSource}</dd></div><div><dt>Collection captured</dt><dd>{dataset.capturedAt}</dd></div><div><dt>Training lineage</dt><dd>{adaptation.datasetStatus}</dd></div><div><dt>Dataset scope</dt><dd>{dataset.scope}</dd></div><div><dt>Evaluation split</dt><dd>{dataset.holdouts}</dd></div><div><dt>Portability</dt><dd>{dataset.portability}</dd></div><div><dt>ZIP SHA-256</dt><dd className="checksum">{dataset.sha256}</dd></div>
    </dl></details>
    {sample && <Modal navigation={galleryNavigation(samples, sample.id, setSample)} title={sample.title} subtitle={sample.kind === 'motion' ? 'Generated motion · Motion study' : sample.selectedForShowcase ? 'Generated image · Showcase selection' : 'Generated draft · Creative review pending'} wide onClose={() => setSample(null)}>{sample.kind === 'motion' ? <VideoPlayer key={sample.id} clip={{ ...sample, poster: sample.poster || '', duration: sample.duration || 0 }} autoPlay /> : <ImageViewer key={sample.id} item={sample} />}<details className="sample-inspector"><summary>Generation details</summary>{sample.method && <p>{sample.method}{sample.referenceCount ? ` · ${sample.referenceCount} identity references` : ''}</p>}<p>{sample.prompt}</p><p>{sample.kind === 'motion' ? 'Source still LoRA: ' : ''}Checkpoint {sample.checkpoint} · Strength {sample.scale} · Seed {sample.seed} · {sample.width} × {sample.height}</p>{sample.sourceStillId && <p>Starting frame: {sample.sourceStillId}. Video model does not load the LoRA.</p>}{sample.reviewNotes && <p>{sample.reviewNotes}</p>}<time dateTime={sample.generatedAt}>{displayDate(sample.generatedAt)}</time></details></Modal>}
    {collectionOpen && <Modal navigation={galleryNavigation(dataset.items, selected?.id, setSelected)} title={selected?.title || 'Mark III - Still Training Set'} subtitle={selected ? `Dataset source · ${selected.width} × ${selected.height}` : `v${dataset.version} · ${dataset.imageCount} image/caption pairs · ${displayDate(dataset.capturedAt)}`} wide onClose={() => { setCollectionOpen(false); setSelected(null); }}>
      {selected ? <><div className="dataset-back"><button className="text-button" onClick={() => setSelected(null)}><ArrowLeft size={14} />Back to collection</button></div><ImageViewer key={selected.id} item={selected} /><div className="dataset-caption"><span className="eyebrow">TRAINING CAPTION</span><p>{selected.caption}</p></div></> : <PaginatedGallery className="dataset-catalog" label="Training collection">{dataset.items.map(item => <button className="canon-tile" key={item.id} onClick={() => setSelected(item)}><div className="canon-image"><img src={item.src} alt={item.title} loading="lazy" /><span className="tile-open" title="Inspect source"><Expand size={16} /></span></div><div className="tile-caption"><strong>{item.title}</strong><span>{item.width} × {item.height} · Caption included</span></div></button>)}</PaginatedGallery>}
    </Modal>}
  </>;
}
