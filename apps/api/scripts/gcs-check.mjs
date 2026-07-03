import { Storage } from '@google-cloud/storage';

const bucketName = process.env.GCS_BUCKET;
const storage = new Storage({
  projectId: process.env.GCS_PROJECT_ID,
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
});
const bucket = storage.bucket(bucketName);

const [exists] = await bucket.exists();
console.log('bucket', bucketName, 'exists:', exists);
if (!exists) process.exit(2);

const key = `healthcheck/test-${Date.now()}.txt`;
const file = bucket.file(key);
await file.save('vitrine gcs ok', { contentType: 'text/plain' });
console.log('write   : OK', key);

const [buf] = await file.download();
console.log('read    :', buf.toString());

const [signed] = await file.getSignedUrl({
  version: 'v4',
  action: 'write',
  expires: Date.now() + 10 * 60 * 1000,
  contentType: 'image/jpeg',
});
console.log('signed  : OK (', signed.slice(0, 70), '...)');

await file.delete();
console.log('delete  : OK');
console.log('=> GCS OK');
