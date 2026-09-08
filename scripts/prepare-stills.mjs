import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(path.dirname(app), 'LoRA Training Set');
const selection = [
  ['60b.png', 'studio-hero-portrait', 'Studio hero portrait', 'hero'],
  ['61b.png', 'three-point-landing', 'Three-point landing', 'hero'],
  ['60a.png', 'helmet-and-chest-portrait', 'Helmet and chest portrait', 'reference'],
  ['61a.png', 'hangar-armor-portrait', 'Hangar armor portrait', 'hero'],
  ['movie1.png', 'gulmira-hero-stance', 'Gulmira - hero stance', 'hero'],
  ['movie2.png', 'gulmira-rear-armor', 'Gulmira - rear armor', 'reference'],
  ['movie15.png', 'repulsor-engagement', 'Repulsor engagement', 'reference'],
  ['movie12.png', 'flight-lateral', 'Flight - lateral profile', 'reference'],
];

export async function prepareStills(target) {
  await fs.mkdir(path.join(target, 'stills'), { recursive: true });
  const stills = [];
  for (const [filename, id, title, category] of selection) {
    const output = await sharp(path.join(source, filename))
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 92 })
      .toFile(path.join(target, 'stills', `${id}.webp`));
    stills.push({ id, title, category, variant: 'Production still', src: `/media/stills/${id}.webp`, width: output.width, height: output.height });
  }
  return stills;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const target = path.join(app, 'public/media');
  const manifestPath = path.join(target, 'manifest.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  manifest.stills = await prepareStills(target);
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`Prepared ${manifest.stills.length} production stills.`);
}
