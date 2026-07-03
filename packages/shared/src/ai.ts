import type { MannequinOption, Provider, RenderType } from './enums.js';

/**
 * Configuration IA partagée (benchmark M3.0 + pipeline API M3a).
 *
 * Slugs & schémas d'input/output vérifiés sur fal.ai le 2026-07-02
 * (pages /models/<slug>/api) — source de vérité unique, réutilisée par
 * `infra/benchmark` et `apps/api/src/services/ai` :
 *
 * 1. FASHN Virtual Try-On v1.6 — `fal-ai/fashn/tryon/v1.6`
 *    Input  : { model_image: string (URL), garment_image: string (URL),
 *               category?: "auto"|"tops"|"bottoms"|"one-pieces" (def "auto"),
 *               mode?: "performance"|"balanced"|"quality" (def "balanced"),
 *               garment_photo_type?: "auto"|"model"|"flat-lay" (def "auto"),
 *               seed?, num_samples?, output_format?: "png"|"jpeg" (def "png") }
 *    Output : { images: [{ url, content_type, file_name, file_size }] }
 *
 * 2. Kling Kolors Virtual Try-On — `fal-ai/kling/v1-5/kolors-virtual-try-on`
 *    Input  : { human_image_url: string, garment_image_url: string, sync_mode? }
 *    Output : { image: { url, width, height, content_type } }  (objet unique, pas de liste)
 *
 * 3. Nano Banana Pro (Gemini 3 Pro Image) édition — `fal-ai/nano-banana-pro/edit`
 *    Input  : { prompt: string, image_urls: string[], num_images?, aspect_ratio?,
 *               output_format?: "jpeg"|"png"|"webp", resolution?, seed?, sync_mode? }
 *    Output : { images: [{ url, content_type, width, height }], description: string }
 *    Variante moins chère (Gemini 2.5 Flash Image) : `fal-ai/nano-banana/edit`
 *    (même schéma prompt + image_urls → images[]) — swap possible ci-dessous.
 */

/** Slugs d'endpoints fal réellement appelés, par provider. */
export const FAL_ENDPOINTS: Record<Provider, string> = {
  fashn: 'fal-ai/fashn/tryon/v1.6',
  kling: 'fal-ai/kling/v1-5/kolors-virtual-try-on',
  // Décision plan : Nano Banana Pro (Gemini 3 Pro Image).
  // Pour tester la variante ~3x moins chère : 'fal-ai/nano-banana/edit' (~0,039 $/image).
  nanobanana: 'fal-ai/nano-banana-pro/edit',
};

/**
 * Prompts d'édition Nano Banana par type de rendu (hors `model`, servi par le try-on).
 * Consigne commune : fidélité absolue au vêtement — texture, motif, couleur, coupe.
 */
export const NANO_PROMPTS: Record<Exclude<RenderType, 'model'>, string> = {
  hanger:
    "Photo produit e-commerce professionnelle : le MÊME vêtement que sur l'image source, " +
    'présenté sur un cintre en bois élégant, devant un fond studio crème uni et doux. ' +
    'Garde la texture, le motif, la couleur et la coupe STRICTEMENT identiques au vêtement source. ' +
    "Ne modifie ni les proportions, ni les détails (boutons, coutures, logos, étiquettes). " +
    'Éclairage studio diffus, ombres légères, cadrage centré vertical.',
  folded:
    "Photo produit e-commerce professionnelle : le MÊME vêtement que sur l'image source, " +
    'plié à plat avec soin, vu du dessus (flat lay, top-down), sur une surface neutre claire. ' +
    'Garde la texture, le motif, la couleur et la coupe STRICTEMENT identiques au vêtement source. ' +
    "Ne modifie ni les proportions, ni les détails (boutons, coutures, logos, étiquettes). " +
    'Lumière douce homogène, style catalogue minimaliste.',
  studio:
    "Packshot e-commerce professionnel : le MÊME vêtement que sur l'image source, " +
    'détouré et présenté en volume (effet ghost mannequin) sur fond studio blanc cassé uniforme. ' +
    'Garde la texture, le motif, la couleur et la coupe STRICTEMENT identiques au vêtement source. ' +
    "Ne modifie ni les proportions, ni les détails (boutons, coutures, logos, étiquettes). " +
    'Éclairage studio professionnel, ombre portée subtile, cadrage produit centré.',
};

/**
 * Suffixe ajouté au prompt Nano Banana quand un fond personnalisé est fourni
 * (le fond est passé en 2ᵉ image dans `image_urls`).
 */
export const NANO_CUSTOM_BACKGROUND_SUFFIX =
  " Utilise la DEUXIÈME image fournie comme fond/arrière-plan de la scène, " +
  'en intégrant le vêtement dessus de façon naturelle (perspective et éclairage cohérents).';

/**
 * Suffixe ajouté au prompt Nano Banana quand plusieurs vues du même vêtement
 * sont fournies (multi-détails : avant + arrière et/ou détail matière,
 * passées après la source dans `image_urls`).
 */
export const NANO_MULTI_VIEW_SUFFIX =
  " Plusieurs images du MÊME vêtement sont fournies (vue avant, puis vue arrière " +
  "et/ou détail de la matière) : combine ces vues pour restituer fidèlement le " +
  'vêtement (texture, motif, couleur, coupe) dans UN SEUL rendu final.';

/**
 * Variante de {@link NANO_CUSTOM_BACKGROUND_SUFFIX} quand des vues
 * additionnelles précèdent le fond dans `image_urls` : le fond n'est alors
 * plus la 2ᵉ image mais la DERNIÈRE.
 */
export const NANO_CUSTOM_BACKGROUND_LAST_SUFFIX =
  " Utilise la DERNIÈRE image fournie comme fond/arrière-plan de la scène, " +
  'en intégrant le vêtement dessus de façon naturelle (perspective et éclairage cohérents).';

/**
 * Rendu « sur modèle » servi par Nano Banana (au lieu du try-on FASHN) :
 * la PREMIÈRE image passée est le mannequin de référence (cohérent d'un visuel
 * à l'autre), la/les suivante(s) sont le vêtement (source + vues additionnelles).
 * On habille le mannequin en gardant son identité et la fidélité du vêtement.
 * Le fond est ajouté par un suffixe (studio par défaut, ou custom en dernière image).
 */
export const NANO_MODEL_DRESS_PROMPT =
  'Photo e-commerce plein pied, photoréaliste : la personne de la PREMIÈRE image ' +
  '(garde son visage, son corps, ses cheveux et sa pose EXACTEMENT identiques) porte le ' +
  'vêtement présenté dans la ou les image(s) SUIVANTE(S). Retire tout cintre et habille-la ' +
  'avec ce vêtement de façon naturelle et bien ajustée (drapé réaliste). Garde la texture, ' +
  'le motif, la couleur, la forme et les détails du vêtement (col, boutons, coutures, zip, ' +
  'logos) STRICTEMENT identiques. Conserve le bas du mannequin (legging gris).';

/** Suffixe fond studio par défaut du rendu « sur modèle » Nano. */
export const NANO_MODEL_BG_STUDIO =
  ' Garde un fond studio gris clair uni, éclairage doux homogène.';

/**
 * Images de mannequins « de base » pour le try-on (FASHN & Kling exigent une photo
 * de personne : model_image / human_image_url).
 *
 * ⚠️ URLs publiques PAR DÉFAUT, à REMPLACER par vos propres mannequins de référence
 * (idéalement : mannequins synthétiques cohérents par boutique, cf. plan §Router IA,
 * et images licenciées — les URLs ci-dessous ne sont que des placeholders de dev).
 * - femme      : asset d'exemple officiel FASHN sur le CDN fal (femme debout, frontal, plein pied)
 * - homme      : photo Unsplash (homme debout, plein pied) — qualité try-on correcte mais non idéale
 * - silhouette : placeholder (réutilise « femme ») — à remplacer par un rendu mannequin
 *                neutre/synthétique généré une fois pour toutes.
 */
export const MANNEQUIN_IMAGES: Record<Exclude<MannequinOption, 'studio'>, string> = {
  // Mannequin femme de référence (généré Gemini, spec FASHN : plein pied, face,
  // bras écartés, base grise moulante, fond studio uni) — uploadé sur le CDN fal.
  femme:
    'https://v3b.fal.media/files/b/0aa0c667/rjKF8pXuGCxl1lQnhnSlA_ChatGPT%20Image%203%20juil.%202026%2C%2015_56_00.png',
  // ⚠️ homme & silhouette : encore des placeholders — à remplacer comme femme.
  homme: 'https://images.unsplash.com/photo-1617137968427-85924c800a22?w=1080&q=80',
  silhouette: 'https://v3.fal.media/files/penguin/aOzrM7vPOSLksKfxSovG6_model.png',
};

/** Mannequin de repli (benchmark + garde-fou du router). */
export const DEFAULT_MANNEQUIN: Exclude<MannequinOption, 'studio'> = 'femme';
