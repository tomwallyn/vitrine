/**
 * Configuration du benchmark IA M3.0 (VITRINE).
 *
 * Objectif : comparer, sur de VRAIES photos de vêtements sur cintre, la fidélité /
 * latence / coût des modèles fal.ai candidats AVANT de bâtir le pipeline (M3).
 *
 * Slugs vérifiés sur fal.ai le 2026-07-02 (pages /models/<slug>/api) :
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

import type { MannequinOption, RenderType } from '@vitrine/shared';

/** Clés internes des modèles benchés (alignées sur l'enum `provider` de @vitrine/shared). */
export type BenchModel = 'fashn' | 'kling' | 'nanobanana';

/** Slugs d'endpoints fal réellement appelés. */
export const FAL_ENDPOINTS: Record<BenchModel, string> = {
  fashn: 'fal-ai/fashn/tryon/v1.6',
  kling: 'fal-ai/kling/v1-5/kolors-virtual-try-on',
  // Décision plan : Nano Banana Pro (Gemini 3 Pro Image).
  // Pour tester la variante ~3x moins chère : 'fal-ai/nano-banana/edit' (~0,039 $/image).
  nanobanana: 'fal-ai/nano-banana-pro/edit',
};

/**
 * Coût estimé par appel, en USD (tables fal.ai, à re-vérifier sur fal.ai/pricing).
 * - FASHN v1.6 : ~0,075 $/image
 * - Kling Kolors try-on : ~0,07 $/appel
 * - Nano Banana Pro (1K/2K) : ~0,134 $/image — la variante `fal-ai/nano-banana/edit`
 *   (Gemini 2.5 Flash Image) est à ~0,039 $/image : mettre à jour si vous swappez le slug.
 */
export const COST_USD_PER_CALL: Record<BenchModel, number> = {
  fashn: 0.075,
  kling: 0.07,
  nanobanana: 0.134,
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
 * Images de mannequins « de base » pour le try-on (FASHN & Kling exigent une photo
 * de personne : model_image / human_image_url).
 *
 * ⚠️ URLs publiques PAR DÉFAUT, à REMPLACER par vos propres mannequins de référence
 * (idéalement : mannequins synthétiques cohérents par boutique, cf. plan §Router IA).
 * - femme      : asset d'exemple officiel FASHN sur le CDN fal (femme debout, frontal, plein pied)
 * - homme      : photo Unsplash (homme debout, plein pied) — qualité try-on correcte mais non idéale
 * - silhouette : placeholder (réutilise « femme ») — à remplacer par un rendu mannequin
 *                neutre/synthétique généré une fois pour toutes.
 */
export const MANNEQUIN_IMAGES: Record<Exclude<MannequinOption, 'studio'>, string> = {
  femme: 'https://v3.fal.media/files/penguin/aOzrM7vPOSLksKfxSovG6_model.png',
  homme: 'https://images.unsplash.com/photo-1617137968427-85924c800a22?w=1080&q=80',
  silhouette: 'https://v3.fal.media/files/penguin/aOzrM7vPOSLksKfxSovG6_model.png',
};

/** Mannequin utilisé par défaut pour les colonnes FASHN/Kling du benchmark. */
export const DEFAULT_MANNEQUIN: Exclude<MannequinOption, 'studio'> = 'femme';

/** Extensions d'images acceptées dans `inputs/`. */
export const INPUT_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'] as const;
