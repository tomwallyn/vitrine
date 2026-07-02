// Test LIVE end-to-end du pipeline de génération (polling fal + URLs signées).
// Prérequis env : CLERK_SECRET_KEY, DATABASE_URL, GCS_*, FAL_KEY. API sur $API_BASE.
import { Storage } from '@google-cloud/storage';
import { neon } from '@neondatabase/serverless';

const API = process.env.API_BASE ?? 'http://localhost:8090';
const CLERK = 'https://api.clerk.com/v1';
const ch = { Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}`, 'Content-Type': 'application/json' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 1) user Clerk de test + JWT
const email = `e2e-${Date.now()}@example.com`;
let r = await fetch(`${CLERK}/users`, { method: 'POST', headers: ch, body: JSON.stringify({ email_address: [email], password: `Vitr!ne-${Date.now()}-Aa9` }) });
const user = await r.json();
if (!r.ok) { console.log('CREATE USER FAIL', r.status, JSON.stringify(user).slice(0, 300)); process.exit(1); }
r = await fetch(`${CLERK}/sessions`, { method: 'POST', headers: ch, body: JSON.stringify({ user_id: user.id }) });
const session = await r.json();
r = await fetch(`${CLERK}/sessions/${session.id}/tokens`, { method: 'POST', headers: ch });
const jwt = (await r.json()).jwt;
const ah = { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' };

// 2) /me crée la boutique
r = await fetch(`${API}/me`, { headers: ah });
const me = await r.json();
if (!r.ok) { console.log('GET /me FAIL', r.status, JSON.stringify(me).slice(0, 300)); process.exit(1); }
const shopId = me.shop.id, authId = me.shop.authId;
console.log('shop:', shopId, '| authId:', authId, '| solde:', me.credits);

// 3) crédits pour la boutique de test
const sql = neon(process.env.DATABASE_URL);
await sql`INSERT INTO credits_ledger (shop_id, delta, reason) VALUES (${shopId}, 5, 'bonus')`;
console.log('crédité +5');

// 4) upload d'une image source réelle dans GCS (sources/<authId>/…)
const img = Buffer.from(await (await fetch('https://picsum.photos/640/854')).arrayBuffer());
const storage = new Storage({ projectId: process.env.GCS_PROJECT_ID, keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS });
const objectPath = `sources/${authId}/e2e-${Date.now()}.jpg`;
await storage.bucket(process.env.GCS_BUCKET).file(objectPath).save(img, { contentType: 'image/jpeg' });
const sourceImageUrl = `https://storage.googleapis.com/${process.env.GCS_BUCKET}/${objectPath}`;
console.log('source uploadée:', sourceImageUrl);

// 5) POST /generations (hanger = Nano Banana, pas besoin d'image mannequin)
r = await fetch(`${API}/generations`, { method: 'POST', headers: ah, body: JSON.stringify({ sourceImageUrl, renderType: 'hanger', mannequinOption: 'studio', backgroundOption: 'studio' }) });
const created = await r.json();
console.log('POST /generations ->', r.status, JSON.stringify(created).slice(0, 200));
const genId = created.id ?? created.generation?.id;
if (!r.ok || !genId) { console.log('ÉCHEC création'); process.exit(1); }

// 6) polling GET /:id
for (let i = 0; i < 45; i++) {
  await sleep(2000);
  r = await fetch(`${API}/generations/${genId}`, { headers: ah });
  const g = await r.json();
  const gen = g.generation ?? g;
  process.stdout.write(`\n[${i}] status=${gen.status}`);
  if (gen.status === 'done') { console.log('\n\n✅ DONE — resultImageUrl:\n', gen.resultImageUrl); process.exit(0); }
  if (gen.status === 'failed') { console.log('\n\n❌ FAILED — error:', gen.error); process.exit(1); }
}
console.log('\n\n⏱️ timeout (toujours en cours après 90s)');
