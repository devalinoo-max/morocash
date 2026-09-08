import sharp from 'sharp';
import { mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, '../public/icons');
mkdirSync(outDir, { recursive: true });

// Icône "any" : reprend exactement le favicon existant (carré arrondi indigo).
const anySvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" width="36" height="36" fill="none">
  <rect width="36" height="36" rx="10" fill="#4338CA"/>
  <path d="M10 23V13L18 20L26 13V23" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="26" cy="9" r="3" fill="#10B981"/>
</svg>
`;

// Icône "maskable" : fond plein bord-à-bord (le masque du launcher applique
// lui-même l'arrondi/cercle), glyphe identique.
const maskableSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" width="36" height="36" fill="none">
  <rect width="36" height="36" fill="#4338CA"/>
  <path d="M10 23V13L18 20L26 13V23" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="26" cy="9" r="3" fill="#10B981"/>
</svg>
`;

const jobs = [
  { svg: anySvg, size: 192, file: 'icon-192.png' },
  { svg: anySvg, size: 512, file: 'icon-512.png' },
  { svg: maskableSvg, size: 512, file: 'icon-maskable-512.png' },
];

for (const job of jobs) {
  await sharp(Buffer.from(job.svg))
    .resize(job.size, job.size)
    .png()
    .toFile(path.join(outDir, job.file));
  console.log('generated', job.file);
}
