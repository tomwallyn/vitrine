/**
 * Vérification push + worker (fastify.inject, sans DB ni clés live) :
 *  1. app complète → POST /me/push-token sans token = 401 (auth Clerk).
 *  2. routes /me isolées avec auth factice → validation zod = 400 AVANT
 *     tout accès DB (token vide, platform inconnue, body vide).
 *  3. contrat @vitrine/shared : registerPushTokenRequestSchema (trim, enum).
 *  4. sendPushToShop ne throw JAMAIS (DB factice en erreur → warn, résout).
 *  5. reconcile worker : RECONCILE_WORKER=off → no-op ; DATABASE_URL absent
 *     → no-op (getDb jamais appelé) ; les deux renvoient un stop() inoffensif.
 */
import Fastify from 'fastify';

process.env.CLERK_SECRET_KEY ??= 'sk_test_dummy';
delete process.env.DATABASE_URL;

const { buildApp } = await import('../src/app.js');
const { registerMeRoutes } = await import('../src/routes/me.js');
const { sendPushToShop } = await import('../src/services/push.js');
const { startReconcileWorker } = await import('../src/services/reconcile-worker.js');
const { registerPushTokenRequestSchema } = await import('@vitrine/shared');
type Db = import('../src/db/client.js').Db;

let failures = 0;
function check(name: string, ok: boolean, extra?: unknown) {
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${ok ? '' : ` ← ${JSON.stringify(extra)}`}`);
  if (!ok) failures += 1;
}

// ── 1. App complète : auth requise ─────────────────────────────
const app = buildApp();
const noAuth = await app.inject({
  method: 'POST',
  url: '/me/push-token',
  payload: { token: 'ExponentPushToken[xxx]', platform: 'ios' },
});
check('POST /me/push-token sans token Clerk → 401', noAuth.statusCode === 401, noAuth.body);
await app.close();

// ── 2. Route isolée : validation zod avant DB ───────────────────
const mini = Fastify();
mini.decorateRequest('authUserId', '');
mini.addHook('onRequest', async (req) => {
  req.authUserId = 'user_test';
});
registerMeRoutes(mini);

const emptyBody = await mini.inject({ method: 'POST', url: '/me/push-token', payload: {} });
check('body vide → 400', emptyBody.statusCode === 400, emptyBody.body);
const emptyToken = await mini.inject({
  method: 'POST',
  url: '/me/push-token',
  payload: { token: '   ', platform: 'ios' },
});
check('token blanc → 400', emptyToken.statusCode === 400, emptyToken.body);
const badPlatform = await mini.inject({
  method: 'POST',
  url: '/me/push-token',
  payload: { token: 'ExponentPushToken[xxx]', platform: 'blackberry' },
});
check('platform inconnue → 400', badPlatform.statusCode === 400, badPlatform.body);
await mini.close();

// ── 3. Contrat partagé ──────────────────────────────────────────
const okReq = registerPushTokenRequestSchema.safeParse({
  token: '  ExponentPushToken[abc]  ',
  platform: 'android',
});
check(
  'registerPushTokenRequestSchema : token trimé + android accepté',
  okReq.success && okReq.data.token === 'ExponentPushToken[abc]',
  okReq,
);
check(
  'registerPushTokenRequestSchema : platform manquante rejetée',
  !registerPushTokenRequestSchema.safeParse({ token: 'x' }).success,
);

// ── 4. sendPushToShop : jamais de throw ─────────────────────────
const dbAlwaysThrows = new Proxy(
  {},
  {
    get() {
      throw new Error('DB indisponible');
    },
  },
) as Db;
let pushWarned = false;
await sendPushToShop(
  dbAlwaysThrows,
  '6a7b8c9d-0e1f-4a2b-8c3d-4e5f6a7b8c9d',
  { title: 't', body: 'b', data: { generationId: 'g' } },
  { info: () => {}, warn: () => (pushWarned = true), error: () => {} },
);
check('sendPushToShop + DB en erreur → warn, résout sans throw', pushWarned);

// ── 5. Worker : gardes off / sans DB ────────────────────────────
const logs: string[] = [];
const log = {
  info: (_o: unknown, msg?: string) => logs.push(msg ?? ''),
  warn: (_o: unknown, msg?: string) => logs.push(msg ?? ''),
  error: () => {},
};

process.env.RECONCILE_WORKER = 'off';
const stopOff = startReconcileWorker(log);
stopOff();
check(
  'RECONCILE_WORKER=off → no-op loggé, stop() inoffensif',
  logs.some((m) => m.includes('désactivé')),
  logs,
);

delete process.env.RECONCILE_WORKER;
const stopNoDb = startReconcileWorker(log); // DATABASE_URL supprimé en tête de script
stopNoDb();
check(
  'DATABASE_URL absent → worker non démarré (warn), sans throw',
  logs.some((m) => m.includes('DATABASE_URL manquant')),
  logs,
);

console.log(
  failures === 0
    ? '\nOK — upsert réel du token et boucle live à vérifier avec DATABASE_URL (cf. serveur dist).'
    : `\n${failures} échec(s).`,
);
process.exit(failures === 0 ? 0 : 1);
