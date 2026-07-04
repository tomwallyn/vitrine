import { garmentTypeSchema, type GarmentType } from '@vitrine/shared';
import { z } from 'zod';

import { subscribeToFal } from './client.js';
import { resolveOcrModel } from './product-ocr.js';

/**
 * Devine le type générique d'une pièce importée (haut / bas / robe) avec le même
 * modèle vision que l'OCR (`openrouter/router/vision`, facturé aux tokens réels →
 * ~0,1 cent par appel). Sert à pré-régler « Votre pièce » dans « Compléter la
 * tenue » (l'utilisateur peut toujours corriger à la main).
 *
 * Best-effort : ne throw JAMAIS — tout échec renvoie 'haut' (défaut sûr).
 */
const CLASSIFY_ENDPOINT = 'openrouter/router/vision';
const CLASSIFY_TIMEOUT_MS = 30_000;

const CLASSIFY_PROMPT =
  'Classe ce vêtement en UN seul mot parmi : haut, bas, robe. ' +
  'haut = vêtement du haut du corps (t-shirt, chemise, pull, veste, manteau). ' +
  'bas = vêtement du bas (pantalon, jean, short, jupe). ' +
  'robe = robe ou combinaison une-pièce. Réponds UNIQUEMENT le mot, en minuscule.';

const visionOutputSchema = z.object({ output: z.string() });

type ClassifyLogger = { warn: (obj: unknown, msg?: string) => void };

/** URL **signée GET** (bucket privé). Renvoie le type, ou 'haut' si indéterminé. */
export async function classifyGarmentType(
  imageUrl: string,
  log?: ClassifyLogger,
): Promise<GarmentType> {
  try {
    const data = await subscribeToFal(
      CLASSIFY_ENDPOINT,
      {
        model: resolveOcrModel(),
        prompt: CLASSIFY_PROMPT,
        image_urls: [imageUrl],
        temperature: 0,
        max_tokens: 5,
      },
      CLASSIFY_TIMEOUT_MS,
    );
    const out = visionOutputSchema.safeParse(data);
    if (!out.success) return 'haut';
    // Extrait le mot-type quel que soit le texte autour (« haut. », « Bas\n »…).
    const word = out.data.output.toLowerCase().match(/haut|bas|robe/)?.[0];
    return garmentTypeSchema.safeParse(word).success ? (word as GarmentType) : 'haut';
  } catch (err) {
    log?.warn(
      { error: err instanceof Error ? err.message : String(err) },
      'Classification du type de vêtement échouée — défaut « haut »',
    );
    return 'haut';
  }
}
