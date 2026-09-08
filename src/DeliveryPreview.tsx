import { useState } from 'react';
import { Cloud, Download } from 'lucide-react';
import { ImageViewer, Modal, VideoPlayer } from './Media';
import CloudExportDialog from './CloudExportDialog';
import type { DeliveryOutput } from './DeliveryOutputs';
export default function DeliveryPreview({ output, onClose }: { output: DeliveryOutput; onClose: () => void }) {
  const [cloud, setCloud] = useState(false);
  if (cloud) return <CloudExportDialog title={output.title} project={output.request.campaign || 'Current project'} onClose={() => setCloud(false)} />;
  return <Modal title={output.title} subtitle={`${output.artifactId} · Prepared format · ${output.width} × ${output.height}`} wide onClose={onClose}>
    <div className="asset-modal-actions"><a className="button primary" href={(output.editable?.src || output.src) + '&download=1'} download><Download size={16} />Export to computer</a><button className="button secondary" onClick={() => setCloud(true)}><Cloud size={16} />Export to Creative Cloud</button></div>
    <p className="format-handoff-note">{output.editable ? 'Photoshop PSD · Embedded original Smart Object · Transparent canvas' : output.kind === 'still' ? 'Earlier flattened PNG. Prepare again for an editable PSD.' : 'Flattened MP4 · Continue editing in Premiere Pro or After Effects'}</p>
    {output.editable && output.editable.scale > 1 && <p className="format-handoff-note">Artwork displayed at {Math.round(output.editable.scale * 100)}% of source size. The original is preserved; inspect sharpness in Photoshop.</p>}
    {output.kind === 'still' ? <div className={output.editable ? 'editable-format-preview' : ''}><ImageViewer item={{ src: output.src, title: output.title, variant: 'Prepared format / Review pending' }} /></div> : <VideoPlayer clip={{ width: output.width, height: output.height, id: output.id, title: output.title, src: output.src, poster: '', duration: output.request.duration || 0 }} autoPlay />}
  </Modal>;
}
