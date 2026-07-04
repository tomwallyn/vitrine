import {
  FAL_ENDPOINTS,
  type MannequinOption,
  type Provider,
  type RenderType,
} from '@vitrine/shared';
import { z } from 'zod';

import { ADAPTERS, type ProviderAdapter } from './adapters.js';

/**
 * Router IA — mapping type de rendu → { provider, endpoint fal, adapter }.
 *
 * - `model`  → **Nano Banana par défaut** : on habille le mannequin de référence
 *              (1ʳᵉ image) avec le vêtement (meilleure fidélité que le try-on FASHN
 *              sur nos photos sur cintre, cf. R&D 2026-07). Switchable vers
 *              `fashn`/`kling` via l'env `AI_ONMODEL_PROVIDER` (sans redéploiement).
 *              Cas particulier mannequin=`studio` (ghost mannequin, pas d'image
 *              de personne) → Nano Banana avec le prompt packshot `studio`.
 * - `hanger` / `folded` / `studio` → Nano Banana Pro edit, prompt de fidélité
 *              par type (NANO_PROMPTS, partagés avec le benchmark).
 *
 * Fond personnalisé : passé en 2ᵉ image à Nano Banana (cf. adapters). Pour les
 * try-on FASHN/Kling, le compositing du fond custom n'est pas encore supporté
 * (TODO M3+ : détourage + compositing post-rendu) — le fond est ignoré.
 */

const onModelProviderSchema = z.enum(['nanobanana', 'fashn', 'kling']);

/**
 * Provider du rendu « sur modèle » : env AI_ONMODEL_PROVIDER, **défaut Nano Banana**
 * (habillage du mannequin — meilleure fidélité que le try-on FASHN sur nos photos
 * sur cintre, cf. R&D 2026-07). Bascule possible vers `fashn`/`kling` sans redéploiement.
 */
export function resolveOnModelProvider(): Provider {
  const parsed = onModelProviderSchema.safeParse(process.env.AI_ONMODEL_PROVIDER);
  return parsed.success ? parsed.data : 'nanobanana';
}

export interface AiRoute {
  provider: Provider;
  /** Slug d'endpoint fal (FAL_ENDPOINTS de @vitrine/shared). */
  endpoint: string;
  adapter: ProviderAdapter;
}

/**
 * Résout la route IA d'une génération (provider figé au moment du POST).
 * Seul le try-on vêtement « sur modèle » quitte Nano ; tout le reste (cintre/
 * plié/studio + **tous les rendus objet**) passe par Nano Banana.
 */
export function resolveAiRoute(
  renderType: RenderType,
  mannequinOption?: MannequinOption | null,
): AiRoute {
  const provider: Provider =
    renderType === 'model' && mannequinOption !== 'studio' ? resolveOnModelProvider() : 'nanobanana';
  return { provider, endpoint: FAL_ENDPOINTS[provider], adapter: ADAPTERS[provider] };
}

/**
 * Slug d'endpoint fal du provider d'une génération existante — utilisé par le
 * reconcile (polling queue fal) pour retrouver l'endpoint depuis la row.
 */
export function endpointForProvider(provider: Provider): string {
  return FAL_ENDPOINTS[provider];
}
