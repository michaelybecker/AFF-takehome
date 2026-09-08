import { Cloud, Download } from 'lucide-react';
import { useState } from 'react';
import CloudExportDialog from './CloudExportDialog';
import type { GenerationRequest } from './provider';
import PaginatedGallery from './PaginatedGallery';
export type DeliveryOutput = { id: string; campaignId: string; artifactId: string; title: string; kind: 'still' | 'motion'; width: number; height: number; sourceId: string; createdAt: string; request: GenerationRequest; bytes: number; src: string; editable?: { format: string; bytes: number; src: string; sourceWidth: number; sourceHeight: number; scale: number } };
export default function DeliveryOutputs({ outputs, onOpen }: { outputs: DeliveryOutput[]; onOpen: (output: DeliveryOutput) => void }) {
  const [cloud, setCloud] = useState<DeliveryOutput | null>(null);
  if (!outputs.length) return null;
  return <section id="generated-adaptations" className="delivery-outputs"><div className="campaign-section-title"><h3>Prepared formats</h3><span>{outputs.length} versions</span></div>
    <PaginatedGallery className="delivery-output-grid" label="Prepared formats">{outputs.map(output => <article key={output.id}>
      {output.kind === 'still' ? <button type="button" onClick={() => onOpen(output)} aria-label={`Preview ${output.title}`}><img src={output.src} alt={output.title} loading="lazy" /></button> : <video src={output.src} controls preload="metadata" playsInline />}
      <strong>{output.artifactId} · {output.title}</strong><span>{output.width} × {output.height} · {output.editable ? 'PSD · Smart Object' : output.kind === 'still' ? 'PNG · Flattened' : 'MP4 · Flattened'} · {((output.editable?.bytes || output.bytes) / 1024 / 1024).toFixed(1)} MB</span><span>{new Date(output.createdAt).toLocaleString()} · Review pending</span>
      <div className="asset-export-actions"><button className="text-button" onClick={() => onOpen(output)}>View format</button><a className="text-button" href={(output.editable?.src || output.src) + '&download=1'} download><Download size={14} />Export to computer</a><button className="text-button" onClick={() => setCloud(output)}><Cloud size={14} />Export to Creative Cloud</button></div>
    </article>)}</PaginatedGallery>
    {cloud && <CloudExportDialog title={cloud.title} project={cloud.request.campaign || 'Current project'} onClose={() => setCloud(null)} />}
  </section>;
}
