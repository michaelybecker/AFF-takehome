import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { zipSync, strToU8 } from 'fflate';
import sharp from 'sharp';

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const project = path.dirname(app);
const source = path.join(project, 'LoRA Training Set');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const titles = {
  '59': 'Studio hero stance', '60a': 'Helmet and chest portrait', '60b': 'Studio hero portrait',
  '61a': 'Hangar armor portrait', '61b': 'Three-point landing',
  movie1: 'Gulmira - hero stance', movie2: 'Gulmira - rear armor', movie3: 'Extended-arm stance',
  movie4: 'Frontal armor study', movie5: 'Lower-leg armor detail', movie6: 'Repulsor lift-off',
  movie7: 'Flight - frontal approach', movie8: 'Flight - low angle', movie10: 'Arc reactor detail',
  movie11: 'Workshop helmet portrait', movie12: 'Flight - lateral profile', movie13: 'Repulsor stance',
  movie14: 'Hip and gauntlet detail', movie15: 'Repulsor engagement', movie16: 'Faceplate detail',
  movie18: 'Night exterior portrait', movie19: 'Production expression study',
};

export async function prepareDerived(target) {
  const destination = path.join(target, 'derived');
  const release = path.join(project, 'Generative_Identity_Kit/Derived_Identity/datasets/mark-iii-v0.1');
  await fs.mkdir(path.join(destination, 'previews'), { recursive: true });
  await fs.mkdir(release, { recursive: true });
  const files = {};
  const items = [];
  for (const [id, title] of Object.entries(titles)) {
    const filename = `${id}.png`;
    const image = await fs.readFile(path.join(source, filename));
    const captionBytes = await fs.readFile(path.join(source, `${id}.txt`));
    const caption = captionBytes.toString('utf8').trim();
    if (!caption.startsWith('IMK3GIK armor,') || (caption.match(/IMK3GIK/g) || []).length !== 1) {
      throw new Error(`Check caption trigger for ${id}`);
    }
    const metadata = await sharp(image).metadata();
    await sharp(image).resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 88 }).toFile(path.join(destination, 'previews', `${id}.webp`));
    files[`dataset/${filename}`] = [image, { level: 0 }];
    files[`dataset/${id}.txt`] = captionBytes;
    items.push({ id, title, filename, caption, width: metadata.width, height: metadata.height,
      src: `/media/derived/previews/${id}.webp`, variant: 'Dataset source',
      imageSha256: sha256(image), captionSha256: sha256(captionBytes) });
  }
  const fingerprint = sha256(Buffer.from(items.map(item => `${item.id}:${item.imageSha256}:${item.captionSha256}`).join('\n')));
  const metadataPath = path.join(release, 'dataset-manifest.json');
  let previous;
  try { previous = JSON.parse(await fs.readFile(metadataPath, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (previous && previous.fingerprint !== fingerprint) throw new Error('Dataset v0.1 has changed. Create a new release instead of overwriting it.');
  const capturedAt = previous?.capturedAt || new Date().toISOString();
  const dataset = {
    id: 'mark-iii-adaptation-dataset-v0.1', name: 'Mark III - Adaptation Dataset', version: '0.1',
    sourceKitVersion: '0.2.0', capturedAt, fingerprint, imageCount: items.length, captionCount: items.length,
    trigger: 'IMK3GIK', scope: 'Local curated collection snapshot; cloud job membership not yet reconciled.',
    portability: 'Reusable image and caption sources. Preprocessing and adapter weights remain model-specific.',
    holdouts: 'No train/evaluation split encoded in this archive.',
    provenance: 'Interview demonstration material, not studio-authorized production assets. Numbered photographs are user-supplied crops from The Art of Iron Man, printed pages 59-61. Movie-prefixed files are user-supplied film-frame candidates without verified timecodes. 59.png has been cropped to remove page graphics.',
    items,
  };
  files['dataset-manifest.json'] = strToU8(JSON.stringify(dataset, null, 2) + '\n');
  files['README.md'] = strToU8(`# Mark III - Adaptation Dataset v0.1\n\n${items.length} original PNG images and matching UTF-8 captions in dataset/.\nTrigger: IMK3GIK.\n\nThis is a snapshot of the curated local collection, not confirmation of the exact membership used by the running cloud job. No holdout split is encoded. Dataset sources are reusable across models; each trainer may require different preprocessing, and LoRA weights remain model-specific.\n\nThe accompanying manifest records capture time, source lineage, dimensions, captions, and SHA-256 hashes. Preview URLs in it refer to the demo app; the full images are included here.\n\nInterview case-study material. Inclusion does not establish studio approval or grant rights to redistribute or train on the underlying media. No weights or generated outputs are included.\n`);
  const zip = zipSync(files, { level: 6, mtime: new Date(capturedAt) });
  const zipName = 'mark-iii-adaptation-dataset-v0.1.zip';
  await fs.writeFile(path.join(release, zipName), zip);
  await fs.writeFile(metadataPath, JSON.stringify(dataset, null, 2) + '\n');
  await fs.writeFile(path.join(destination, zipName), zip);
  return {
    trainingDatasets: await fs.readFile(path.join(destination, 'training-datasets.json'), 'utf8').then(JSON.parse).catch(error => { if (error.code === 'ENOENT') return []; throw error; }),
    sampleResults: await fs.readFile(path.join(destination, 'sample-results.json'), 'utf8').then(JSON.parse).catch(error => { if (error.code === 'ENOENT') return []; throw error; }),
    dataset: { ...dataset, download: `/media/derived/${zipName}`, bytes: zip.length, sha256: sha256(zip) },
    adaptation: { id: 'mark-iii-studio-identity-v0.1', name: 'Mark III - Studio Identity', version: '0.1',
      initiatedOn: '2026-09-07', status: 'Trained / Evaluation in progress', statusSource: 'Training completion and checkpoint 750 inference verified in the research session, 2026-09-07; not live-synchronized or studio approved.',
      baseModel: 'black-forest-labs/FLUX.2-klein-base-4B', trainer: 'Ostris AI Toolkit / RunComfy',
      jobName: 'imk3gik_klein4b_v01', modality: 'Still-image adaptation', weightsStatus: 'Checkpoint 750 selected for evaluation; training completed at step 1500', selectedCheckpoint: 750,
      datasetStatus: 'Cloud job membership pending reconciliation', evaluationStatus: 'In progress / Creative approval pending' },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const target = path.join(app, 'public/media');
  const manifestPath = path.join(target, 'manifest.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  manifest.derived = await prepareDerived(target);
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`Packaged ${manifest.derived.dataset.imageCount} image/caption pairs; ${manifest.derived.dataset.bytes} bytes.`);
}
