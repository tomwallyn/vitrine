/**
 * Vérification M5 (fastify.inject, sans DB ni clés live) :
 *  1. app complète → /gallery GET/POST sans token = 401 (auth Clerk).
 *  2. routes gallery isolées avec auth factice → validation zod = 400
 *     AVANT tout accès DB (les chemins heureux exigent une DATABASE_URL Neon).
 */
import Fastify from 'fastify';

process.env.CLERK_SECRET_KEY ??= 'sk_test_dummy';

const { buildApp } = await import('../src/app.js');
const { registerGalleryRoutes } = await import('../src/routes/gallery.js');

let failures = 0;
function check(name: string, ok: boolean, extra?: unknown) {
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${ok ? '' : ` ← ${JSON.stringify(extra)}`}`);
  if (!ok) failures += 1;
}

// ── 1. App complète : auth requise ─────────────────────────────
const app = buildApp();
const get401 = await app.inject({ method: 'GET', url: '/gallery' });
check('GET /gallery sans token → 401', get401.statusCode === 401, get401.body);
const post401 = await app.inject({ method: 'POST', url: '/gallery', payload: {} });
check('POST /gallery sans token → 401', post401.statusCode === 401, post401.body);
await app.close();

// ── 2. Routes gallery seules : validation avant DB ─────────────
const mini = Fastify();
mini.decorateRequest('authUserId', '');
mini.addHook('onRequest', async (req) => {
  req.authUserId = 'user_test';
});
registerGalleryRoutes(mini);

const noBody = await mini.inject({ method: 'POST', url: '/gallery', payload: {} });
check('POST /gallery body vide → 400', noBody.statusCode === 400, noBody.body);
const badId = await mini.inject({
  method: 'POST',
  url: '/gallery',
  payload: { generationId: 'not-a-uuid' },
});
check('POST /gallery generationId non-uuid → 400', badId.statusCode === 400, badId.body);
const badFilter = await mini.inject({ method: 'GET', url: '/gallery?filter=bogus' });
check('GET /gallery?filter=bogus → 400', badFilter.statusCode === 400, badFilter.body);
const badLimit = await mini.inject({ method: 'GET', url: '/gallery?limit=0' });
check('GET /gallery?limit=0 → 400', badLimit.statusCode === 400, badLimit.body);
await mini.close();

console.log(
  failures === 0
    ? '\nOK — chemins heureux GET/POST /gallery non testés ici (DATABASE_URL Neon requis).'
    : `\n${failures} échec(s).`,
);
process.exit(failures === 0 ? 0 : 1);
