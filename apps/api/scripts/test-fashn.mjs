// Test LIVE FASHN try-on : mannequin femme de référence + un vêtement (URL GCS).
//   node --env-file=.env scripts/test-fashn.mjs "<url-gcs-du-vetement>"
import { fal } from '@fal-ai/client';
import { Storage } from '@google-cloud/storage';
import { writeFile } from 'node:fs/promises';

fal.config({ credentials: process.env.FAL_KEY });

const MODEL_URL =
  'https://v3b.fal.media/files/b/0aa0c667/rjKF8pXuGCxl1lQnhnSlA_ChatGPT%20Image%203%20juil.%202026%2C%2015_56_00.png';

const garmentGcsUrl = process.argv[2];
const bucket = process.env.GCS_BUCKET;
const objectPath = garmentGcsUrl.split(`${bucket}/`)[1].split('?')[0];
const storage = new Storage({
  projectId: process.env.GCS_PROJECT_ID,
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
});
const [garmentSigned] = await storage
  .bucket(bucket)
  .file(objectPath)
  .getSignedUrl({ version: 'v4', action: 'read', expires: Date.now() + 3600 * 1000 });

console.log('FASHN try-on (flat-lay / quality) en cours…');
const result = await fal.subscribe('fal-ai/fashn/tryon/v1.6', {
  input: {
    model_image: MODEL_URL,
    garment_image: garmentSigned,
    garment_photo_type: 'flat-lay',
    mode: 'quality',
    output_format: 'png',
  },
  logs: false,
});
const url = result.data?.images?.[0]?.url;
if (!url) {
  console.error('Pas de rendu :', JSON.stringify(result.data).slice(0, 400));
  process.exit(1);
}
const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
const out = process.argv[3] || '/tmp/fashn-test.png';
await writeFile(out, buf);
console.log('rendu OK →', out, `(${Math.round(buf.length / 1024)} Ko)`);
