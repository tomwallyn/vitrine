/**
 * Vérification multi-images + batch (fastify.inject, sans DB/fal/GCS live) :
 *  1. app complète → POST /generations/batch sans token = 401 (auth Clerk).
 *  2. route batch isolée avec auth factice → validation zod = 400 AVANT
 *     tout accès DB (items vide, > MAX_BATCH_ITEMS, fond custom sans URL).
 *  3. contrats @vitrine/shared : createBatchRequestSchema (bornes 1..30),
 *     createGenerationRequestSchema rétrocompatible (extraImages optionnel).
 *  4. adapters : Nano Banana combine [source, arrière?, détail?, fond?] et
 *     adapte le prompt ; FASHN/Kling ignorent les vues additionnelles ;
 *     `label` n'est jamais injectée dans le rendu.
 *
 * Chemins nécessitant du live (DATABASE_URL + FAL_KEY + GCS) — non testés ici :
 *  - POST /generations/batch avec solde < items.length → 402 (pré-check getBalance) ;
 *  - POST /generations avec extraImages → 201 (hold + insert extra_images + submit fal).
 */
import Fastify from 'fastify';

process.env.CLERK_SECRET_KEY ??= 'sk_test_dummy';

const { buildApp } = await import('../src/app.js');
const { registerGenerationBatchRoutes } = await import('../src/routes/generations.js');
const { ADAPTERS } = await import('../src/services/ai/adapters.js');
const { createBatchRequestSchema, createGenerationRequestSchema, MAX_BATCH_ITEMS } = await import(
  '@vitrine/shared'
);

let failures = 0;
function check(name: string, ok: boolean, extra?: unknown) {
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${ok ? '' : ` ← ${JSON.stringify(extra)}`}`);
  if (!ok) failures += 1;
}

const src = 'https://storage.googleapis.com/vitrine-dev/sources/user_x/front.jpg';
const style = { renderType: 'hanger', mannequinOption: 'femme' };

// ── 1. App complète : auth requise sur POST /generations/batch ──
const app = buildApp();
const post401 = await app.inject({
  method: 'POST',
  url: '/generations/batch',
  payload: { items: [{ sourceImageUrl: src }], ...style },
});
check('POST /generations/batch sans token → 401', post401.statusCode === 401, post401.body);
await app.close();

// ── 2. Route batch seule : validation zod avant DB ──────────────
const mini = Fastify();
mini.decorateRequest('authUserId', '');
mini.addHook('onRequest', async (req) => {
  req.authUserId = 'user_test';
});
registerGenerationBatchRoutes(mini);

const emptyItems = await mini.inject({
  method: 'POST',
  url: '/generations/batch',
  payload: { items: [], ...style },
});
check('batch items vide → 400', emptyItems.statusCode === 400, emptyItems.body);

const tooMany = await mini.inject({
  method: 'POST',
  url: '/generations/batch',
  payload: { items: Array.from({ length: MAX_BATCH_ITEMS + 1 }, () => ({ sourceImageUrl: src })), ...style },
});
check(`batch ${MAX_BATCH_ITEMS + 1} items (> ${MAX_BATCH_ITEMS}) → 400`, tooMany.statusCode === 400, tooMany.body);

const customNoUrl = await mini.inject({
  method: 'POST',
  url: '/generations/batch',
  payload: { items: [{ sourceImageUrl: src }], ...style, backgroundOption: 'custom' },
});
check('batch fond custom sans customBackgroundUrl → 400', customNoUrl.statusCode === 400, customNoUrl.body);

const badItemUrl = await mini.inject({
  method: 'POST',
  url: '/generations/batch',
  payload: { items: [{ sourceImageUrl: 'pas-une-url' }], ...style },
});
check('batch sourceImageUrl invalide → 400', badItemUrl.statusCode === 400, badItemUrl.body);
await mini.close();

// ── 3. Contrats partagés ─────────────────────────────────────────
check('MAX_BATCH_ITEMS = 30', MAX_BATCH_ITEMS === 30, MAX_BATCH_ITEMS);
const maxOk = createBatchRequestSchema.safeParse({
  items: Array.from({ length: MAX_BATCH_ITEMS }, () => ({ sourceImageUrl: src })),
  ...style,
});
check('batch de 30 items → valide (backgroundOption défaut studio)', maxOk.success && maxOk.data.backgroundOption === 'studio', maxOk.error?.flatten());

const legacySingle = createGenerationRequestSchema.safeParse({ sourceImageUrl: src, ...style });
check(
  'single sans extraImages → valide, extraImages absent (rétrocompat)',
  legacySingle.success && legacySingle.data.extraImages === undefined,
  legacySingle.error?.flatten(),
);
const back = 'https://storage.googleapis.com/vitrine-dev/sources/user_x/back.jpg';
const detail = 'https://storage.googleapis.com/vitrine-dev/sources/user_x/detail.jpg';
const label = 'https://storage.googleapis.com/vitrine-dev/sources/user_x/label.jpg';
const multiSingle = createGenerationRequestSchema.safeParse({
  sourceImageUrl: src,
  ...style,
  extraImages: { back, detail, label },
});
check('single avec extraImages {back, detail, label} → valide', multiSingle.success, multiSingle.error?.flatten());
const badExtra = createGenerationRequestSchema.safeParse({
  sourceImageUrl: src,
  ...style,
  extraImages: { back: 'pas-une-url' },
});
check('single extraImages.back invalide → rejeté', !badExtra.success);

// ── 4. Adapters : multi-vues Nano Banana, try-on inchangés ───────
const baseParams = {
  sourceImageUrl: src,
  renderType: 'hanger',
  mannequinOption: 'femme',
  backgroundOption: 'studio',
  customBackgroundUrl: null,
} as const;

const nanoSolo = ADAPTERS.nanobanana.buildInput({ ...baseParams });
check(
  'nano sans extra → image_urls = [source] (comportement inchangé)',
  JSON.stringify(nanoSolo.image_urls) === JSON.stringify([src]),
  nanoSolo.image_urls,
);
check(
  'nano sans extra → prompt sans mention multi-vues',
  typeof nanoSolo.prompt === 'string' && !nanoSolo.prompt.includes('Plusieurs images'),
);

const nanoMulti = ADAPTERS.nanobanana.buildInput({
  ...baseParams,
  extraImageUrls: { back, detail },
});
check(
  'nano multi → image_urls = [source, back, detail] (label exclue)',
  JSON.stringify(nanoMulti.image_urls) === JSON.stringify([src, back, detail]),
  nanoMulti.image_urls,
);
check(
  'nano multi → prompt « plusieurs vues du même vêtement »',
  typeof nanoMulti.prompt === 'string' && nanoMulti.prompt.includes('MÊME vêtement sont fournies'),
  nanoMulti.prompt,
);

const bg = 'https://storage.googleapis.com/vitrine-dev/backgrounds/user_x/fond.jpg';
const nanoMultiBg = ADAPTERS.nanobanana.buildInput({
  ...baseParams,
  backgroundOption: 'custom',
  customBackgroundUrl: bg,
  extraImageUrls: { back },
});
check(
  'nano multi + fond custom → image_urls = [source, back, fond]',
  JSON.stringify(nanoMultiBg.image_urls) === JSON.stringify([src, back, bg]),
  nanoMultiBg.image_urls,
);
check(
  'nano multi + fond custom → le prompt pointe la DERNIÈRE image comme fond',
  typeof nanoMultiBg.prompt === 'string' && nanoMultiBg.prompt.includes('DERNIÈRE image'),
  nanoMultiBg.prompt,
);
const nanoBgOnly = ADAPTERS.nanobanana.buildInput({
  ...baseParams,
  backgroundOption: 'custom',
  customBackgroundUrl: bg,
});
check(
  'nano fond custom sans extra → « DEUXIÈME image » (comportement inchangé)',
  typeof nanoBgOnly.prompt === 'string' && nanoBgOnly.prompt.includes('DEUXIÈME image'),
  nanoBgOnly.prompt,
);

const fashnInput = ADAPTERS.fashn.buildInput({
  ...baseParams,
  renderType: 'model',
  extraImageUrls: { back, detail },
});
check(
  'FASHN → garment_image = source seule (extra ignorées)',
  fashnInput.garment_image === src && !JSON.stringify(fashnInput).includes(back),
  fashnInput,
);
const klingInput = ADAPTERS.kling.buildInput({
  ...baseParams,
  renderType: 'model',
  extraImageUrls: { back, detail },
});
check(
  'Kling → garment_image_url = source seule (extra ignorées)',
  klingInput.garment_image_url === src && !JSON.stringify(klingInput).includes(back),
  klingInput,
);

console.log(
  failures === 0
    ? '\nOK — à vérifier en live : batch 402 (solde < items.length), single 201 avec extraImages (insert + submit fal réels).'
    : `\n${failures} échec(s).`,
);
process.exit(failures === 0 ? 0 : 1);
