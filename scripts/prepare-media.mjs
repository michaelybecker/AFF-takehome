import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const project = path.dirname(app);
const kit = path.join(project, 'Generative_Identity_Kit');
const target = path.join(app, 'public/media');
for (const dir of ['brand', 'model', 'video', 'posters', 'canon', 'passes/beauty', 'passes/matte', 'passes/depth', 'passes/normals']) {
  await fs.mkdir(path.join(target, dir), { recursive: true });
}
for (const file of ['marvel-studios.jpg', 'firefly.svg']) {
  await fs.copyFile(path.join(project, 'brand/assets', file), path.join(target, 'brand', file));
}
await fs.copyFile(path.join(kit, 'Source_Asset/iron_man.glb'), path.join(target, 'model/iron-man.glb'));
const beauty = path.join(kit, 'Renders/web_layers/beauty');
const first = await sharp(path.join(beauty, '0001_beauty.png')).metadata();
if (!first.hasAlpha) throw new Error('Beauty has no alpha; cannot produce a verified matte.');
for (let frame = 1; frame <= 48; frame++) {
  const n = String(frame).padStart(4, '0');
  for (const pass of ['beauty', 'depth', 'normals']) {
    const files = await fs.readdir(path.join(kit, 'Renders/web_layers', pass));
    const filename = files.find(f => f.startsWith(n + '_'));
    if (!filename) throw new Error(`Missing ${pass} ${n}`);
    await sharp(path.join(kit, 'Renders/web_layers', pass, filename)).resize(640, 640).webp({ quality: 85 }).toFile(path.join(target, 'passes', pass, n + '.webp'));
  }
  await sharp(path.join(beauty, n + '_beauty.png')).extractChannel('alpha').resize(640, 640).webp({ lossless: true }).toFile(path.join(target, 'passes/matte', n + '.webp'));
}
const clips = [];
for (const filename of (await fs.readdir(path.join(kit, 'Video/web'))).filter(f => f.endsWith('.mp4'))) {
  const input = path.join(kit, 'Video/web', filename);
  const id = path.parse(filename).name;
  await fs.copyFile(input, path.join(target, 'video', filename));
  const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'quiet', '-show_format', '-show_streams', '-of', 'json', input], { encoding: 'utf8', windowsHide: true }));
  const duration = Number(probe.format.duration);
  const stream = probe.streams.find(s => s.codec_type === 'video');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(Math.min(duration * .35, 2)), '-i', input, '-frames:v', '1', '-vf', 'scale=640:-2', path.join(target, 'posters', id + '.jpg')], { windowsHide: true });
  clips.push({ id, title: id.replaceAll('_', ' '), duration, width: stream.width, height: stream.height, src: '/media/video/' + filename, poster: '/media/posters/' + id + '.jpg' });
}
const canon = [];
const hashes = new Set();
for (const filename of await fs.readdir(path.join(kit, 'ConceptArt'))) {
  const input = path.join(kit, 'ConceptArt', filename);
  const contents = await fs.readFile(input);
  const key = contents.toString('base64');
  if (hashes.has(key)) continue;
  hashes.add(key);
  const id = path.parse(filename).name.replace(/[^a-zA-Z0-9_-]/g, '-');
  await sharp(input).resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true }).webp({ quality: 88 }).toFile(path.join(target, 'canon', id + '.webp'));
  canon.push({ id, src: '/media/canon/' + id + '.webp', title: filename.includes('mk42') ? 'Mark XLII design reference' : 'Armor design study', variant: filename.includes('mk42') ? 'Alternate armor' : 'Design reference', original: filename });
}
await fs.writeFile(path.join(target, 'manifest.json'), JSON.stringify({ version: '0.2.0', clips, canon, passes: ['beauty', 'matte', 'depth', 'normals'], frames: 48 }, null, 2));
console.log(`Prepared ${clips.length} clips, ${canon.length} unique concept images, 192 pass images and source GLB.`);
