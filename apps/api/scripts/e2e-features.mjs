// Test LIVE : multi-images (avant/arrière/étiquette → 1 rendu) + OCR fiche produit + batch.
import { Storage } from '@google-cloud/storage';
import { neon } from '@neondatabase/serverless';

const API = process.env.API_BASE ?? 'http://localhost:8090';
const CLERK = 'https://api.clerk.com/v1';
const ch = { Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}`, 'Content-Type': 'application/json' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const storage = new Storage({ projectId: process.env.GCS_PROJECT_ID, keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS });

async function auth() {
  const email = `feat-${Date.now()}@example.com`;
  let r = await fetch(`${CLERK}/users`, { method: 'POST', headers: ch, body: JSON.stringify({ email_address: [email], password: `Vitr!ne-${Date.now()}-Aa9` }) });
  const user = await r.json();
  r = await fetch(`${CLERK}/sessions`, { method: 'POST', headers: ch, body: JSON.stringify({ user_id: user.id }) });
  const s = await r.json();
  r = await fetch(`${CLERK}/sessions/${s.id}/tokens`, { method: 'POST', headers: ch });
  return { jwt: (await r.json()).jwt, authId: user.id };
}
async function upload(authId, name) {
  const buf = Buffer.from(await (await fetch('https://picsum.photos/640/854')).arrayBuffer());
  const path = `sources/${authId}/${name}-${Date.now()}.jpg`;
  await storage.bucket(process.env.GCS_BUCKET).file(path).save(buf, { contentType: 'image/jpeg' });
  return `https://storage.googleapis.com/${process.env.GCS_BUCKET}/${path}`;
}

const { jwt, authId } = await auth();
const ah = { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' };
const me = await (await fetch(`${API}/me`, { headers: ah })).json();
const sql = neon(process.env.DATABASE_URL);
await sql`INSERT INTO credits_ledger (shop_id, delta, reason) VALUES (${me.shop.id}, 20, 'bonus')`;
console.log('shop', me.shop.id, '| authId', authId);

// ---- 1) MULTI-IMAGES + OCR ----
console.log('\n=== 1) MULTI-IMAGES (avant+arrière+étiquette) + OCR ===');
const [front, back, label] = await Promise.all([upload(authId, 'front'), upload(authId, 'back'), upload(authId, 'label')]);
let r = await fetch(`${API}/generations`, { method: 'POST', headers: ah, body: JSON.stringify({ sourceImageUrl: front, renderType: 'hanger', mannequinOption: 'studio', backgroundOption: 'studio', extraImages: { back, label } }) });
const created = (await r.json()).generation;
console.log('POST /generations (multi) ->', r.status, 'id', created?.id);
let gen, doneAt = 0;
for (let i = 0; i < 50; i++) {
  await sleep(2000);
  gen = (await (await fetch(`${API}/generations/${created.id}`, { headers: ah })).json()).generation;
  if (gen.status === 'done' && !doneAt) { doneAt = i; console.log(`  done @${i*2}s ; extraImages:`, JSON.stringify(gen.extraImages)); }
  if (doneAt && gen.productInfo) { console.log('  ✅ productInfo:', JSON.stringify(gen.productInfo)); break; }
  if (gen.status === 'failed') { console.log('  ❌ failed:', gen.error); break; }
  if (doneAt && i - doneAt > 8) { console.log('  ⚠️ productInfo toujours vide après done (OCR null ou lent):', gen.productInfo); break; }
}

// ---- 2) BATCH ----
console.log('\n=== 2) BATCH (2 vêtements) ===');
const [b1, b2] = await Promise.all([upload(authId, 'b1'), upload(authId, 'b2')]);
r = await fetch(`${API}/generations/batch`, { method: 'POST', headers: ah, body: JSON.stringify({ items: [{ sourceImageUrl: b1 }, { sourceImageUrl: b2 }], renderType: 'studio', mannequinOption: 'studio', backgroundOption: 'studio' }) });
const batch = await r.json();
console.log('POST /generations/batch ->', r.status, '| ids:', (batch.generations || []).map((g) => g.id));
const ids = (batch.generations || []).map((g) => g.id);
for (let i = 0; i < 50 && ids.length; i++) {
  await sleep(2000);
  const statuses = await Promise.all(ids.map(async (id) => {
    const g = await (await fetch(`${API}/generations/${id}`, { headers: ah })).json();
    return g?.generation?.status ?? 'pending';
  }));
  process.stdout.write(`\n  [${i*2}s] ${statuses.join(', ')}`);
  if (statuses.every((s) => s === 'done' || s === 'failed')) { console.log('\n  ✅ batch terminé:', statuses.join(', ')); break; }
}
console.log('\n\nFIN');
