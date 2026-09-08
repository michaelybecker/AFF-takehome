import { Children, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function PaginatedGallery({ children, className, label, scope = '' }: { children: ReactNode; className: string; label: string; scope?: string }) {
  const items = Children.toArray(children);
  const [selection, setSelection] = useState({ scope, page: 0 });
  const pages = Math.ceil(items.length / 8);
  const page = Math.min(selection.scope === scope ? selection.page : 0, Math.max(0, pages - 1));
  const change = (next: number) => {
    setSelection({ scope, page: next });
  };
  return <div className="paginated-gallery">
    <div className={className}>{items.slice(page * 8, page * 8 + 8)}</div>
    {pages > 1 && <nav className="gallery-pagination" aria-label={`${label} pages`}>
      <span aria-live="polite">{page * 8 + 1}–{Math.min(page * 8 + 8, items.length)} of {items.length}</span>
      <button className="icon-button" aria-label={`Previous ${label} page`} title="Previous page" disabled={page === 0} onClick={() => change(page - 1)}><ChevronLeft size={18} /></button>
      <span>Page {page + 1} of {pages}</span>
      <button className="icon-button" aria-label={`Next ${label} page`} title="Next page" disabled={page === pages - 1} onClick={() => change(page + 1)}><ChevronRight size={18} /></button>
    </nav>}
  </div>;
}
