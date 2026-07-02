/**
 * Vérification pipeline de génération DEV (fastify.inject, sans DB/fal/GCS live) :
 *  1. app complète → GET /generations/:id sans token = 401 (auth Clerk).
 *  2. reconcileGeneration : row `queued` SANS provider_request_id → no-op,
 *     sans throw et sans toucher DB/fal.
 *  3. reconcileGeneration : row terminée (`done`) → no-op.
 *  4. reconcileGeneration : row `processing` AVEC request_id mais fal
 *     inaccessible (FAL_KEY absent) → erreur tolérée, row renvoyée telle quelle.
 */
process.env.CLERK_SECRET_KEY ??= 'sk_test_dummy';
// Force un environnement fal hors-ligne : le reconcile doit tolérer l'échec.
delete process.env.FAL_KEY;

const { buildApp } = await import('../src/app.js');
const { reconcileGeneration } = await import('../src/services/generations.js');
type GenerationRow = import('../src/services/generations.js').GenerationRow;
type Db = import('../src/db/client.js').Db;

let failures = 0;
function check(name: string, ok: boolean, extra?: unknown) {
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${ok ? '' : ` ← ${JSON.stringify(extra)}`}`);
  if (!ok) failures += 1;
}

// ── 1. App complète : auth requise sur GET /generations/:id ─────
const app = buildApp();
const get401 = await app.inject({
  method: 'GET',
  url: '/generations/5f6b2a54-9e1d-4f3a-8d2c-1a2b3c4d5e6f',
});
check('GET /generations/:id sans token → 401', get401.statusCode === 401, get401.body);
await app.close();

// ── 2-4. reconcileGeneration : cas no-op / erreur fal tolérée ───
const log = { info: () => {}, warn: () => {}, error: () => {} };
// DB factice : ces cas ne doivent JAMAIS toucher la base.
const dbNeverCalled = new Proxy(
  {},
  {
    get(_t, prop) {
      throw new Error(`DB inattendue pendant le reconcile (accès à ${String(prop)})`);
    },
  },
) as Db;

const baseRow = {
  id: '5f6b2a54-9e1d-4f3a-8d2c-1a2b3c4d5e6f',
  shopId: '6a7b8c9d-0e1f-4a2b-8c3d-4e5f6a7b8c9d',
  sourceImageUrl: 'https://storage.googleapis.com/vitrine-dev/sources/user_x/photo.jpg',
  renderType: 'hanger',
  modelOption: 'femme',
  backgroundOption: 'studio',
  customBackgroundUrl: null,
  provider: 'nanobanana',
  providerRequestId: null,
  status: 'queued',
  resultImageUrl: null,
  error: null,
  holdLedgerId: null,
  createdAt: new Date(),
  completedAt: null,
} as GenerationRow;

const queuedNoRequest = await reconcileGeneration(dbNeverCalled, baseRow, log);
check(
  'reconcile row queued sans provider_request_id → row inchangée, sans throw',
  queuedNoRequest === baseRow,
);

const doneRow = { ...baseRow, status: 'done', providerRequestId: 'req_1' } as GenerationRow;
const doneUnchanged = await reconcileGeneration(dbNeverCalled, doneRow, log);
check('reconcile row done → no-op (pas de repasse fal)', doneUnchanged === doneRow);

const processingRow = {
  ...baseRow,
  status: 'processing',
  providerRequestId: 'req_dev_offline',
} as GenerationRow;
const falDown = await reconcileGeneration(dbNeverCalled, processingRow, log);
check(
  'reconcile row processing + fal inaccessible → erreur tolérée, row telle quelle',
  falDown === processingRow,
);

console.log(
  failures === 0
    ? '\nOK — complétion réelle (status fal COMPLETED → done + image GCS) à vérifier en live.'
    : `\n${failures} échec(s).`,
);
process.exit(failures === 0 ? 0 : 1);
