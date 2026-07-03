// Vérifie le VRAI chemin de code : resolveAiRoute + adapter.buildInput/parseOutput
// (compilés dans dist/) pour un rendu render_type=model → doit router vers Nano.
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

const route = resolveAiRoute('model', 'femme');
console.log('provider =', route.provider, '| endpoint =', route.endpoint);

const input = route.adapter.buildInput({
  sourceImageUrl: garment,
  renderType: 'model',
  mannequinOption: 'femme',
  backgroundOption: 'studio',
  customBackgroundUrl: null,
  extraImageUrls: null,
});
console.log('nb images =', input.image_urls.length, '(attendu 2 : mannequin + vêtement)');
console.log('1ʳᵉ image =', input.image_urls[0].slice(0, 60), '… (doit être le mannequin)');
console.log('prompt =', input.prompt.slice(0, 70), '…');

const r = await fal.subscribe(route.endpoint, { input, logs: false });
const { imageUrl } = route.adapter.parseOutput(r.data);
const buf = Buffer.from(await (await fetch(imageUrl)).arrayBuffer());
await writeFile('/tmp/route-model.png', buf);
console.log('rendu OK → /tmp/route-model.png', `(${Math.round(buf.length / 1024)} Ko)`);
