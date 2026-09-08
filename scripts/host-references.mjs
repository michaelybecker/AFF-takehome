import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import sharp from 'sharp';
import { put, head, BlobNotFoundError } from '@vercel/blob';
import { loadEnv } from 'vite';

const root = process.cwd();
const token = loadEnv('development', root, '').BLOB_READ_WRITE_TOKEN;
if (!token) throw new Error('BLOB_READ_WRITE_TOKEN is missing.');
const manifest = JSON.parse(await readFile(path.join(root, 'public/media/manifest.json'), 'utf8'));
const target = path.join(root, 'server/hosted-references.json');
let previous = [];
try { previous = JSON.parse(await readFile(target, 'utf8')).references; } catch (e) { if (e.code !== 'ENOENT') throw e; }
const candidates = [
  ...(manifest.stills || []).map(item => ({ ...item, group: 'Source images' })),
  ...(manifest.derived?.dataset.items || []).map(item => ({ ...item, group: 'Source images' })),
  ...(manifest.derived?.sampleResults || []).filter(item => item.kind !== 'motion').map(item => ({ ...item, group: 'Generated images' })),
];
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const seen = new Map();
const visualSignatures = [];
let duplicates = 0;
for (const item of candidates) {
  const local = path.resolve(root, 'public', '.' + item.src);
  if (!local.startsWith(path.join(root, 'public') + path.sep)) throw new Error('Invalid source path');
  const input = await readFile(local);
  const normalized = await sharp(input, { limitInputPixels: 40000000 }).rotate().toColourspace('srgb').ensureAlpha().png().toBuffer();
  const sha256 = digest(normalized);
  if (seen.has(sha256)) { seen.get(sha256).aliases.push(item.id); duplicates++; continue; }
  const metadata = await sharp(normalized).metadata();
  const signature = await sharp(normalized).resize(32, 32, { fit: 'fill' }).removeAlpha().raw().toBuffer();
  const aspect = metadata.width / metadata.height;
  const duplicate = visualSignatures.find(other => Math.abs(other.aspect - aspect) < 0.02 && signature.reduce((sum, value, index) => sum + Math.abs(value - other.signature[index]), 0) / signature.length < 4);
  if (duplicate) { seen.get(duplicate.hash).aliases.push(item.id); duplicates++; continue; }
  const id = 'ref-' + sha256.slice(0, 24);
  const pathname = 'firefly-demo/references/' + sha256 + '.png';
  let imageUrl;
  try { imageUrl = (await head(pathname, { token })).url; }
  catch (error) {
    if (!(error instanceof BlobNotFoundError)) throw error;
    imageUrl = (await put(pathname, normalized, { token, access: 'public', addRandomSuffix: false, contentType: 'image/png' })).url;
  }
  const response = await fetch(imageUrl, { redirect: 'error', signal: AbortSignal.timeout(30000) });
  if (!response.ok || digest(Buffer.from(await response.arrayBuffer())) !== sha256) throw new Error('Hosted image verification failed');
  const lora = item.group === 'Generated images' ? {
    adaptationId: manifest.derived.adaptation.id, checkpoint: item.checkpoint, strength: item.scale,
    model: manifest.derived.adaptation.baseModel, seed: item.seed, contribution: 'reference-image conditioning', loadedByMotionModel: false,
  } : null;
  seen.set(sha256, { id, title: item.title, src: item.src, imageUrl, sha256, group: item.group, aliases: [item.id], lora, hosted: true });
  visualSignatures.push({ hash: sha256, aspect, signature });
  console.log('Verified ' + item.title);
  // Save progress after every verified file; reruns reuse content-addressed blobs.
  await writeFile(target, JSON.stringify({ version: 1, references: [...seen.values(), ...previous.filter(ref => !seen.has(ref.sha256))] }, null, 2) + '\n');
}
await writeFile(target, JSON.stringify({ version: 1, references: [...seen.values()] }, null, 2) + '\n');
console.log(JSON.stringify({ references: seen.size, duplicatesRemoved: duplicates, uploadedSecrets: false }));
