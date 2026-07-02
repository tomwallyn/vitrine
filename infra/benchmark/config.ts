/**
 * Configuration du benchmark IA M3.0 (VITRINE).
 *
 * Objectif : comparer, sur de VRAIES photos de vêtements sur cintre, la fidélité /
 * latence / coût des modèles fal.ai candidats AVANT de bâtir le pipeline (M3).
 *
 * Les slugs fal, prompts de fidélité et images de mannequins sont CENTRALISÉS
 * dans `@vitrine/shared` (packages/shared/src/ai.ts) — mêmes valeurs que le
 * pipeline de production (apps/api/src/services/ai). Les schémas d'input/output
 * vérifiés y sont documentés.
 */

import type { Provider } from '@vitrine/shared';

export {
  DEFAULT_MANNEQUIN,
  FAL_ENDPOINTS,
  MANNEQUIN_IMAGES,
  NANO_PROMPTS,
} from '@vitrine/shared';

/** Clés internes des modèles benchés (alignées sur l'enum `provider` de @vitrine/shared). */
export type BenchModel = Provider;

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

/** Extensions d'images acceptées dans `inputs/`. */
export const INPUT_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'] as const;
