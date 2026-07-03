/**
 * Vérification OCR fiche produit (sans fal/GCS/DB live) :
 *  1. parseProductInfoText : JSON strict complet → objet validé.
 *  2. JSON dans un fence markdown + texte autour → objet validé (tolérant).
 *  3. Champs null / vides / inconnus → omis, description conservée.
 *  4. `description` absente → null (champ obligatoire de la fiche).
 *  5. Texte sans JSON / JSON invalide → null.
 *  6. extractProductInfo sans aucune image → null (aucun appel fal).
 *  7. extractProductInfo avec fal inaccessible (FAL_KEY absent) → null, SANS throw.
 *  8. extractAndStoreProductInfo : row sans label/detail → no-op (DB jamais touchée).
 *  9. extractAndStoreProductInfo : product_info déjà présent → no-op (DB jamais touchée).
 * 10. extractAndStoreProductInfo : label présent mais GCS/fal indisponibles →
 *     erreur avalée (warn), aucune écriture DB, la promesse résout.
 *
 * L'extraction réelle (vraie étiquette → fiche) exige un appel fal live :
 * à vérifier en dev avec FAL_KEY + une génération multi-détails contenant `label`.
 */
process.env.CLERK_SECRET_KEY ??= 'sk_test_dummy';
// Force un environnement hors-ligne : l'OCR doit tolérer fal ET GCS absents.
delete process.env.FAL_KEY;
delete process.env.GCS_BUCKET;

const { parseProductInfoText, extractProductInfo } = await import(
  '../src/services/ai/product-ocr.js'
);
const { extractAndStoreProductInfo } = await import('../src/services/generations.js');
type GenerationRow = import('../src/services/generations.js').GenerationRow;
type Db = import('../src/db/client.js').Db;

let failures = 0;
function check(name: string, ok: boolean, extra?: unknown) {
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${ok ? '' : ` ← ${JSON.stringify(extra)}`}`);
  if (!ok) failures += 1;
}

const log = { info: () => {}, warn: () => {}, error: () => {} };

// ── 1. JSON strict complet ───────────────────────────────────────
const full = parseProductInfoText(
  '{"matiere":"coton","taille":"M","couleur":"bleu marine","composition":"80% coton, 20% polyester","entretien":"lavage 30°C","description":"Sweat en coton bleu marine, coupe droite."}',
);
check(
  'JSON strict → fiche complète validée',
  !!full &&
    full.matiere === 'coton' &&
    full.taille === 'M' &&
    full.couleur === 'bleu marine' &&
    full.composition === '80% coton, 20% polyester' &&
    full.entretien === 'lavage 30°C' &&
    full.description === 'Sweat en coton bleu marine, coupe droite.',
  full,
);

// ── 2. Fence markdown + texte autour (réponse LLM typique) ──────
const fenced = parseProductInfoText(
  'Voici la fiche extraite :\n```json\n{"matiere": "laine", "description": "Pull en laine."}\n```\nBonne journée !',
);
check(
  'JSON dans un fence markdown → extrait et validé',
  !!fenced && fenced.matiere === 'laine' && fenced.description === 'Pull en laine.',
  fenced,
);

// ── 3. Champs null / vides / inconnus → omis proprement ─────────
const sparse = parseProductInfoText(
  '{"matiere":null,"taille":"  ","couleur":"noir","autre_champ":"x","description":" Veste noire élégante. "}',
);
check(
  'champs null/vides/inconnus omis, description trimée conservée',
  !!sparse &&
    !('matiere' in sparse) &&
    !('taille' in sparse) &&
    sparse.couleur === 'noir' &&
    sparse.description === 'Veste noire élégante.' &&
    !('autre_champ' in sparse),
  sparse,
);

// ── 4. description absente → null ────────────────────────────────
check(
  'description absente → null',
  parseProductInfoText('{"matiere":"coton","taille":"M"}') === null,
);

// ── 5. Pas de JSON / JSON invalide → null ────────────────────────
check('texte sans JSON → null', parseProductInfoText('Aucune étiquette lisible.') === null);
check('JSON invalide → null', parseProductInfoText('résultat : {matiere: coton}') === null);

// ── 6. Aucune image → null (aucun appel fal tenté) ───────────────
check('extractProductInfo sans image → null', (await extractProductInfo(null, null, log)) === null);

// ── 7. fal inaccessible (FAL_KEY absent) → null sans throw ───────
let warned = false;
const falDown = await extractProductInfo(
  'https://storage.googleapis.com/vitrine-dev/sources/user_x/label.jpg',
  null,
  { warn: () => (warned = true) },
);
check('extractProductInfo + fal inaccessible → null sans throw (warn loggé)', falDown === null && warned);

// ── 8-10. extractAndStoreProductInfo : garde-fous et tolérance ───
// DB factice : ces cas ne doivent JAMAIS toucher la base.
const dbNeverCalled = new Proxy(
  {},
  {
    get(_t, prop) {
      throw new Error(`DB inattendue pendant l'OCR (accès à ${String(prop)})`);
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
  extraImages: null,
  productInfo: null,
  provider: 'nanobanana',
  providerRequestId: 'req_1',
  status: 'done',
  resultImageUrl: 'https://storage.googleapis.com/vitrine-dev/results/user_x/gen.png',
  error: null,
  holdLedgerId: null,
  createdAt: new Date(),
  completedAt: new Date(),
} as GenerationRow;

await extractAndStoreProductInfo(dbNeverCalled, baseRow, log);
check('row sans label/detail → no-op (DB jamais touchée), sans throw', true);

const alreadyExtracted = {
  ...baseRow,
  extraImages: { label: 'https://storage.googleapis.com/vitrine-dev/sources/user_x/label.jpg' },
  productInfo: { description: 'Déjà extraite.' },
} as GenerationRow;
await extractAndStoreProductInfo(dbNeverCalled, alreadyExtracted, log);
check('product_info déjà présent → no-op (pas de double OCR), sans throw', true);

let ocrWarned = false;
const withLabel = {
  ...baseRow,
  extraImages: {
    label: 'https://storage.googleapis.com/vitrine-dev/sources/user_x/label.jpg',
    detail: 'https://storage.googleapis.com/vitrine-dev/sources/user_x/detail.jpg',
  },
} as GenerationRow;
await extractAndStoreProductInfo(dbNeverCalled, withLabel, {
  ...log,
  warn: () => (ocrWarned = true),
});
check('label présent + GCS/fal indisponibles → erreur avalée, aucune écriture DB', ocrWarned);

console.log(
  failures === 0
    ? "\nOK — extraction réelle (vraie étiquette → fiche via openrouter/router/vision) à vérifier en live avec FAL_KEY."
    : `\n${failures} échec(s).`,
);
process.exit(failures === 0 ? 0 : 1);
