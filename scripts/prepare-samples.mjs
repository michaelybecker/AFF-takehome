import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = process.argv[2];
if (!source) throw new Error('Provide the local art-direction results directory.');
const nativeSource = process.argv[3];
if (!nativeSource) throw new Error('Also provide the native reference results directory.');
const destination = path.join(app, 'public/media/derived/samples');
await fs.mkdir(destination, { recursive: true });
const selection = [
  ['18-helmet-shadow', 'The icon'],
];
const samples = [];
const nativeId = '08-film-cool-window-lora060-seed146';
const native = JSON.parse(await fs.readFile(path.join(nativeSource, nativeId, 'lineage.json'), 'utf8'));
if (native.phase !== 'completed' || native.settings.strength !== 0.6 || native.references.length !== 2) throw new Error('Unexpected native sample lineage.');
const nativeImage = native.assets[0];
await sharp(path.join(nativeSource, nativeId, 'image.png')).webp({ quality: 95 }).toFile(path.join(destination, `${nativeId}.webp`));
samples.push({ id: nativeId, title: 'Window study', src: `/media/derived/samples/${nativeId}.webp`, variant: 'Showcase selection', selectedForShowcase: true,
  width: nativeImage.width, height: nativeImage.height, prompt: native.graph['5'].inputs.text, seed: native.settings.seed,
  checkpoint: 750, scale: native.settings.strength, generatedAt: native.submissionAttemptedAt,
  method: 'Reference-guided LoRA generation', referenceCount: native.references.length });
for (const [id, title] of selection) {
  const record = JSON.parse(await fs.readFile(path.join(source, `${id}.json`), 'utf8'));
  const inputs = record.workflow['1'].inputs;
  await sharp(path.join(source, `${id}.png`)).webp({ quality: 93 }).toFile(path.join(destination, `${id}.webp`));
  samples.push({ id, title, src: `/media/derived/samples/${id}.webp`, variant: 'Generated draft',
    width: inputs.width, height: inputs.height, prompt: inputs.prompt, seed: inputs.seed,
    checkpoint: 750, scale: inputs.lora_scale, generatedAt: record.submittedUtc, method: 'Text-guided LoRA generation' });
}
// Retain separately curated motion studies when rebuilding still samples.
try {
  const previous = JSON.parse(await fs.readFile(path.join(destination, '../sample-results.json'), 'utf8'));
  samples.push(...previous.filter(item => item.kind === 'motion' && item.id !== 'grounded-ignition-shutdown'));
} catch (error) { if (error.code !== 'ENOENT') throw error; }
await fs.writeFile(path.join(destination, '../sample-results.json'), JSON.stringify(samples, null, 2) + '\n');
const manifestPath = path.join(app, 'public/media/manifest.json');
const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
manifest.derived.sampleResults = samples;
await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`Prepared ${samples.length} draft sample results.`);
