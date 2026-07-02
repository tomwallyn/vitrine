/**
 * Vérification M6a (fastify.inject, sans DB ni clés live) :
 *  1. app complète → GET/PATCH /me sans token = 401 (auth Clerk).
 *  2. routes /me isolées avec auth factice → validation zod = 400 AVANT
 *     tout accès DB (settings invalides).
 *  3. contrats @vitrine/shared : stats obligatoires dans MeResponse,
 *     settings rétrocompatibles (préréglage optionnel), temps gagné.
 *  4. infra/gcs/lifecycle.json : purge des sources/ à 30 jours uniquement.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import Fastify from 'fastify';

process.env.CLERK_SECRET_KEY ??= 'sk_test_dummy';

const { buildApp } = await import('../src/app.js');
const { registerMeRoutes } = await import('../src/routes/me.js');
const { meResponseSchema, shopSettingsSchema, timeSavedMinutes, formatTimeSaved } = await import(
  '@vitrine/shared'
);

let failures = 0;
function check(name: string, ok: boolean, extra?: unknown) {
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${ok ? '' : ` ← ${JSON.stringify(extra)}`}`);
  if (!ok) failures += 1;
}

// ── 1. App complète : auth requise ─────────────────────────────
const app = buildApp();
const get401 = await app.inject({ method: 'GET', url: '/me' });
check('GET /me sans token → 401', get401.statusCode === 401, get401.body);
const patch401 = await app.inject({ method: 'PATCH', url: '/me', payload: {} });
check('PATCH /me sans token → 401', patch401.statusCode === 401, patch401.body);
await app.close();

// ── 2. Routes /me seules : validation avant DB ─────────────────
const mini = Fastify();
mini.decorateRequest('authUserId', '');
mini.addHook('onRequest', async (req) => {
  req.authUserId = 'user_test';
});
registerMeRoutes(mini);

const badPreset = await mini.inject({
  method: 'PATCH',
  url: '/me',
  payload: { settings: { defaultBackgroundOption: 'bogus' } },
});
check('PATCH /me defaultBackgroundOption invalide → 400', badPreset.statusCode === 400, badPreset.body);
const badName = await mini.inject({ method: 'PATCH', url: '/me', payload: { name: '' } });
check('PATCH /me name vide → 400', badName.statusCode === 400, badName.body);
await mini.close();

// ── 3. Contrats partagés : stats + préréglages ──────────────────
const sampleShop = {
  id: '5f6b2a54-9e1d-4f3a-8d2c-1a2b3c4d5e6f',
  authId: 'user_test',
  name: 'Ma boutique',
  city: null,
  avatarUrl: null,
  settings: { watermark: true },
  createdAt: new Date().toISOString(),
};
const withStats = meResponseSchema.safeParse({
  shop: sampleShop,
  credits: 3,
  stats: { visualsCount: 164, timeSavedMinutes: 2460 },
});
check('MeResponse avec stats → valide', withStats.success, withStats.error?.flatten());
const withoutStats = meResponseSchema.safeParse({ shop: sampleShop, credits: 3 });
check('MeResponse sans stats → rejeté (contrat)', !withoutStats.success);

const legacySettings = shopSettingsSchema.safeParse({ watermark: false });
check('settings existants sans préréglage → valides (rétrocompat)', legacySettings.success);
const fullPreset = shopSettingsSchema.safeParse({
  watermark: true,
  defaultRenderType: 'hanger',
  defaultMannequinOption: 'homme',
  defaultBackgroundOption: 'custom',
});
check('settings avec préréglage complet → valides', fullPreset.success);

check('timeSavedMinutes(164) = 2460', timeSavedMinutes(164) === 2460, timeSavedMinutes(164));
check("formatTimeSaved(2460) = '~41h'", formatTimeSaved(2460) === '~41h', formatTimeSaved(2460));
check("formatTimeSaved(45) = '45 min'", formatTimeSaved(45) === '45 min', formatTimeSaved(45));

// ── 4. Lifecycle GCS : purge sources/ à 30 jours ────────────────
const lifecyclePath = fileURLToPath(new URL('../../../infra/gcs/lifecycle.json', import.meta.url));
const lifecycle = JSON.parse(readFileSync(lifecyclePath, 'utf8')) as {
  rule: { action: { type: string }; condition: { age: number; matchesPrefix: string[] } }[];
};
const rule = lifecycle.rule[0];
check(
  'lifecycle.json : Delete à 30 jours sur sources/ uniquement',
  lifecycle.rule.length === 1 &&
    rule?.action.type === 'Delete' &&
    rule.condition.age === 30 &&
    rule.condition.matchesPrefix.length === 1 &&
    rule.condition.matchesPrefix[0] === 'sources/',
  lifecycle,
);

console.log(
  failures === 0
    ? '\nOK — chemins heureux GET/PATCH /me non testés ici (DATABASE_URL Neon requis).'
    : `\n${failures} échec(s).`,
);
process.exit(failures === 0 ? 0 : 1);
