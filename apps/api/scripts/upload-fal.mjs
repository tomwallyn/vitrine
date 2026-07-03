// Upload d'un fichier local vers fal.storage → URL CDN permanente (mannequins…).
//   node --env-file=.env scripts/upload-fal.mjs "/chemin/vers/image.png"
import { fal } from '@fal-ai/client';
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';

fal.config({ credentials: process.env.FAL_KEY });

const path = process.argv[2];
if (!path) {
  console.error('Usage: node --env-file=.env scripts/upload-fal.mjs <chemin-image>');
  process.exit(1);
}
const buf = await readFile(path);
const ext = path.split('.').pop()?.toLowerCase();
const type = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
const blob = new Blob([buf], { type });
// @fal-ai/client accepte un File (name pour l'extension côté CDN).
const file = new File([blob], basename(path), { type });
const url = await fal.storage.upload(file);
console.log(url);
