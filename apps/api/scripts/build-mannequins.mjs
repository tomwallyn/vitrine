// Héberge les mannequins sur le CDN fal → structure MANNEQUINS à coller dans ai.ts.
import { fal } from '@fal-ai/client';
import { readFile } from 'node:fs/promises';

fal.config({ credentials: process.env.FAL_KEY });
const DL = '/Users/10156769/Downloads';

const ITEMS = [
  { file: 'Gemini_Generated_Image_bc8cpnbc8cpnbc8c', slot: 'femme', id: 'femme-1', name: 'Femme 1' },
  { file: 'Gemini_Generated_Image_9w57ql9w57ql9w57', slot: 'femme', id: 'femme-2', name: 'Femme 2' },
  { file: 'Gemini_Generated_Image_bbi7nrbbi7nrbbi7', slot: 'femme', id: 'femme-3', name: 'Femme 3' },
  { file: 'Gemini_Generated_Image_b5c8mb5c8mb5c8mb', slot: 'homme', id: 'homme-1', name: 'Homme 1' },
  { file: 'Gemini_Generated_Image_480eu0480eu0480e', slot: 'homme', id: 'homme-2', name: 'Homme 2' },
  { file: 'Gemini_Generated_Image_8nwz108nwz108nwz', slot: 'homme', id: 'homme-3', name: 'Homme 3' },
];

const result = { femme: [], homme: [] };
for (const it of ITEMS) {
  process.stdout.write(`${it.id} … `);
  const buf = await readFile(`${DL}/${it.file}.png`);
  const url = await fal.storage.upload(new File([buf], `${it.id}.png`, { type: 'image/png' }));
  result[it.slot].push({ id: it.id, name: it.name, url });
  console.log('OK');
}
console.log('\n=== MANNEQUINS (femme/homme) ===');
console.log(JSON.stringify(result, null, 2));
