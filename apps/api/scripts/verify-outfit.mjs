// Vérifie le VRAI chemin outfit : génère un packshot de bas, puis
// resolveAiRoute('model','femme').buildInput avec garmentType+outfit → fal.
import { fal } from '@fal-ai/client';
import { Storage } from '@google-cloud/storage';
import { writeFile } from 'node:fs/promises';

import { resolveAiRoute } from '../dist/services/ai/config.js';

fal.config({ credentials: process.env.FAL_KEY });

const storage = new Storage({
  projectId: process.env.GCS_PROJECT_ID,
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
});
const objPath = process.argv[2].split(`${process.env.GCS_BUCKET}/`)[1].split('?')[0];
const [garment] = await storage
  .bucket(process.env.GCS_BUCKET)
  .file(objPath)
  .getSignedUrl({ version: 'v4', action: 'read', expires: Date.now() + 3600 * 1000 });
const save = async (url, out) => {
  const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
  await writeFile(out, buf);
  return `${Math.round(buf.length / 1024)} Ko`;
};

console.log('1) génère un packshot « pantalon noir » (text-to-image, stand-in de test) …');
const pk = await fal.subscribe('fal-ai/flux/schnell', {
  input: {
    prompt:
      'E-commerce product packshot of a pair of black tailored trousers, ghost mannequin effect ' +
      '(no person, no hanger), centered on a pure white seamless background, soft even studio lighting, ' +
      'subtle shadow, photorealistic.',
    image_size: 'portrait_4_3',
    num_images: 1,
  },
  logs: false,
});
const pantalonUrl = pk.data.images[0].url;
await save(pantalonUrl, '/tmp/default-pantalon.png');
console.log('   → /tmp/default-pantalon.png');

console.log('2) buildInput (model/femme, garmentType=haut, outfit.bottom=pantalon) …');
const route = resolveAiRoute('model', 'femme');
const input = route.adapter.buildInput({
  sourceImageUrl: garment,
  renderType: 'model',
  mannequinOption: 'femme',
  backgroundOption: 'studio',
  garmentType: 'haut',
  outfitImages: { bottom: pantalonUrl },
});
console.log('   provider =', route.provider, '| nb images =', input.image_urls.length, '(attendu 3)');
console.log('   prompt =', input.prompt.slice(0, 90), '…');

console.log('3) rendu …');
const r = await fal.subscribe(route.endpoint, { input, logs: false });
console.log('   →', await save(route.adapter.parseOutput(r.data).imageUrl, '/tmp/outfit-test.png'));
console.log('FIN');
