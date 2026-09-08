import sharp from 'sharp';

// Decode bounded inline images only. Never fetch a client-supplied media URL.
export async function visionContent(review) {
  if (!review || typeof review.assetId !== 'string' || review.assetId.length > 200 || typeof review.title !== 'string' || review.title.length > 500 || !['still', 'motion'].includes(review.kind) || !Array.isArray(review.notes) || review.notes.length > 10 || review.notes.some(note => typeof note !== 'string' || note.length > 1000) || !Array.isArray(review.images) || !review.images.length || review.images.length > 14) throw new Error('Invalid visual review.');
  const content = [];
  for (const frame of review.images) {
    if (typeof frame.label !== 'string' || frame.label.length > 300 || typeof frame.image !== 'string' || frame.image.length > 700000 || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(frame.image)) throw new Error('Invalid review image.');
    const bytes = Buffer.from(frame.image.slice(frame.image.indexOf(',') + 1), 'base64');
    const image = await sharp(bytes, { limitInputPixels: 2000000 }).rotate().resize({ width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
    content.push({ type: 'input_text', text: frame.label }, { type: 'input_image', image_url: `data:image/jpeg;base64,${image.toString('base64')}`, detail: 'high' });
  }
  return content;
}
