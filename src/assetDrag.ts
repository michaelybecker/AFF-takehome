import type { DragEvent } from 'react';
export const assetMime = 'application/x-content-studio-asset';
export function startAssetDrag(event: DragEvent, id: string) {
  event.dataTransfer.setData(assetMime, id);
  event.dataTransfer.effectAllowed = 'copy';
}
export function acceptAssetDrag(event: DragEvent) {
  if (!event.dataTransfer.types.includes(assetMime)) return false;
  event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; return true;
}
export function attachToAssistant(id: string) {
  window.dispatchEvent(new CustomEvent('studio-attach-asset', { detail: id }));
}
