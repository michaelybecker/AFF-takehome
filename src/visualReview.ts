export type ReviewAsset = { id: string; title: string; kind: string; src: string; lineage?: unknown };
export type ReviewImage = { label: string; image: string };
export type VisualReview = { assetId: string; title: string; kind: string; images: ReviewImage[]; notes: string[] };

function localMedia(src: string) {
  const url = new URL(src, location.origin);
  const blob = url.protocol === 'https:' && /^[a-z0-9]+\.public\.blob\.vercel-storage\.com$/.test(url.hostname) && url.pathname.startsWith('/firefly-demo/project-explorations/');
  if (!blob && (url.origin !== location.origin || !(/^\/media\//.test(url.pathname) || ['/api/stills', '/api/motion'].includes(url.pathname)))) throw new Error('Review requires workspace media.');
  return url.href;
}
function waitFor(target: HTMLMediaElement | HTMLImageElement, event: string, start: () => void) {
  return new Promise<void>((resolve, reject) => {
    const done = (error?: Error) => { clearTimeout(timer); target.removeEventListener(event, ready); target.removeEventListener('error', failed); error ? reject(error) : resolve(); };
    const ready = () => done();
    const failed = () => done(new Error('Could not load media for visual review.'));
    const timer = window.setTimeout(() => done(new Error('Media preparation timed out. Try again.')), 15000);
    target.addEventListener(event, ready, { once: true }); target.addEventListener('error', failed, { once: true });
    start();
  });
}
function capture(source: CanvasImageSource, width: number, height: number) {
  if (!width || !height) throw new Error('Media has no decodable image.');
  const scale = Math.min(1, 1280 / Math.max(width, height));
  const canvas = document.createElement('canvas'); canvas.width = Math.round(width * scale); canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Image capture unavailable.');
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', .85);
}
async function still(src: string) {
  const image = new Image();
  image.crossOrigin = 'anonymous';
  await waitFor(image, 'load', () => { image.src = localMedia(src); });
  return capture(image, image.naturalWidth, image.naturalHeight);
}
export async function prepareVisualReview(asset: ReviewAsset, references: { id: string; title: string; src: string }[], progress: (text: string) => void): Promise<VisualReview> {
  const review: VisualReview = { assetId: asset.id, title: asset.title, kind: asset.kind, images: [], notes: [] };
  if (asset.kind === 'motion') {
    const video = document.createElement('video'); video.muted = true; video.preload = 'auto'; video.playsInline = true;
    video.crossOrigin = 'anonymous';
    try {
      progress('Loading video for visual review...');
      await waitFor(video, 'loadeddata', () => { video.src = localMedia(asset.src); video.load(); });
      if (!Number.isFinite(video.duration) || video.duration <= 0) throw new Error('Video duration unavailable.');
      for (let i = 0; i < 10; i++) {
        const time = Math.max(0, video.duration - .04) * i / 9;
        progress(`Preparing frame ${i + 1} of 10...`);
        if (Math.abs(video.currentTime - time) > .001) await waitFor(video, 'seeked', () => { video.currentTime = time; });
        review.images.push({ label: `Generated video frame at ${time.toFixed(2)}s`, image: capture(video, video.videoWidth, video.videoHeight) });
      }
      review.notes.push(`Ten evenly spaced frames across ${video.duration.toFixed(2)} seconds. No audio or continuous playback supplied; defects between samples may be missed.`);
    } finally { video.removeAttribute('src'); video.load(); }
  } else {
    progress('Preparing generated still...');
    review.images.push({ label: 'Generated still', image: await still(asset.src) });
  }
  for (const ref of references.slice(0, 4)) {
    progress(`Preparing reference: ${ref.title}...`);
    try { review.images.push({ label: `Identity comparison reference: ${ref.title} (${ref.id})`, image: await still(ref.src) }); }
    catch { review.notes.push(`Reference ${ref.title} could not be loaded. Do not claim comparison against it.`); }
  }
  return review;
}
