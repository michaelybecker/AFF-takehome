export function galleryNavigation<T extends { id: string }>(items: T[], currentId: string | undefined, select: (item: T) => void) {
  const index = items.findIndex(item => item.id === currentId);
  if (index < 0 || items.length < 2) return undefined;
  return {
    position: index + 1, total: items.length,
    previous: () => select(items[(index - 1 + items.length) % items.length]),
    next: () => select(items[(index + 1) % items.length]),
  };
}
