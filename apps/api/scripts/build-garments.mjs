// Prépare les suggestions de vêtements par défaut :
//   upscale ×2 (real-ESRGAN) → carré 1200×1200 (fond = couleur du coin) → upload CDN fal.
// Sort la structure DEFAULT_GARMENT_IMAGES à coller dans packages/shared/src/ai.ts.
import { fal } from '@fal-ai/client';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';

fal.config({ credentials: process.env.FAL_KEY });
const DL = '/Users/10156769/Downloads';

const ITEMS = [
  { file: 'jean-brut', key: 'jean-brut', name: 'Jean brut', slot: 'bas' },
  { file: 'pantalon-noir', key: 'pantalon-noir', name: 'Pantalon noir', slot: 'bas' },
  { file: 'chino-beige', key: 'chino-beige', name: 'Chino beige', slot: 'bas' },
  { file: 'jupe-midi-noir', key: 'jupe-midi', name: 'Jupe midi', slot: 'bas' },
  { file: 'short-en-jean', key: 'short', name: 'Short', slot: 'bas' },
  { file: 't-shirt-blanc', key: 'tshirt-blanc', name: 'T-shirt blanc', slot: 'haut' },
  { file: 'chemise-blanche', key: 'chemise-blanche', name: 'Chemise blanche', slot: 'haut' },
  { file: 'pull-col-rond-noir', key: 'pull-noir', name: 'Pull noir', slot: 'haut' },
  { file: 'baskets-blanches', key: 'baskets-blanches', name: 'Baskets blanches', slot: 'chaussures' },
  { file: 'bottines-noires', key: 'bottines-noires', name: 'Bottines noires', slot: 'chaussures' },
  { file: 'mocassins-camel', key: 'mocassins-camel', name: 'Mocassins camel', slot: 'chaussures' },
];

async function uploadLocal(path, name) {
  const buf = await readFile(path);
  return fal.storage.upload(new File([buf], name, { type: 'image/png' }));
}

const result = { bas: [], haut: [], chaussures: [] };
for (const it of ITEMS) {
  process.stdout.write(`${it.file} … `);
  const inUrl = await uploadLocal(`${DL}/${it.file}.png`, `${it.file}.png`);
  const up = await fal.subscribe('fal-ai/esrgan', { input: { image_url: inUrl, scale: 2 }, logs: false });
  const upPath = `/tmp/up-${it.file}.png`;
  await writeFile(upPath, Buffer.from(await (await fetch(up.data.image.url)).arrayBuffer()));
  // Détoure les marges (vêtement centré et grand), puis carré 1200 avec un fond
  // = couleur du coin APRÈS détourage (sans raccord visible).
  const trPath = `/tmp/tr-${it.key}.png`;
  execFileSync('magick', [upPath, '-fuzz', '8%', '-trim', '+repage', trPath]);
  const color = execFileSync('magick', [trPath, '-format', '%[pixel:p{0,0}]', 'info:']).toString().trim();
  const sqPath = `/tmp/sq-${it.key}.png`;
  execFileSync('magick', [
    trPath, '-resize', '1040x1040', '-background', color, '-gravity', 'center', '-extent', '1200x1200', sqPath,
  ]);
  const cdnUrl = await uploadLocal(sqPath, `${it.key}.png`);
  result[it.slot].push({ key: it.key, name: it.name, url: cdnUrl });
  console.log('OK');
}

console.log('\n=== DEFAULT_GARMENT_IMAGES ===');
console.log(JSON.stringify(result, null, 2));
