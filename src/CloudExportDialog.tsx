import { Cloud } from 'lucide-react';
import { Modal } from './Media';
export default function CloudExportDialog({ title, project, onClose }: { title: string; project: string; onClose: () => void }) {
  return <Modal title="Export to Creative Cloud" subtitle={title} onClose={onClose}>
    <div className="modal-copy cloud-export-dialog"><Cloud size={28} /><label className="field">Project<select defaultValue="current"><option value="current">{project}</option></select></label>
      <p>Continue working with this asset in your Adobe apps.</p>
      <p className="muted" role="status">Destination preview · Creative Cloud export is not connected in this prototype. No file will be uploaded.</p>
      <div className="asset-export-actions"><button className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled>Export</button></div>
    </div>
  </Modal>;
}
