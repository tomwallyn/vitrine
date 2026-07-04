import type { SubjectType } from '@vitrine/shared';
import { z } from 'zod';

import { subscribeToFal } from './client.js';
import { resolveOcrModel } from './product-ocr.js';

/**
 * Nomme automatiquement le produit à partir de la photo source, avec le même
 * modèle vision que l'OCR (`openrouter/router/vision`, facturé aux tokens réels
 * → ~0,1 cent / appel). Sert de titre par défaut en galerie + à la recherche.
 *
 * Best-effort : ne throw JAMAIS — renvoie null en cas d'échec (titre par défaut
 * « type de rendu · date » conservé).
 */
const NAME_ENDPOINT = 'openrouter/router/vision';
const NAME_TIMEOUT_MS = 30_000;
const MAX_NAME_LENGTH = 40;

const visionOutputSchema = z.object({ output: z.string() });

type NameLogger = { warn: (obj: unknown, msg?: string) => void };

function buildPrompt(subjectType: SubjectType): string {
  const kind = subjectType === 'objet' ? 'objet' : 'vêtement';
  const example =
    subjectType === 'objet' ? '« Vase céramique beige »' : '« Blouson simili cuir noir »';
  return (
    `Donne un nom de produit e-commerce COURT (2 à 4 mots) en français pour le ${kind} sur la photo ` +
    `(ex. ${example}). Réponds UNIQUEMENT le nom, sans guillemets ni ponctuation finale.`
  );
}

/** URL **signée GET** (bucket privé). Renvoie un nom court, ou null si échec. */
export async function generateProductName(
  imageUrl: string,
  subjectType: SubjectType,
  log?: NameLogger,
): Promise<string | null> {
  try {
    const data = await subscribeToFal(
      NAME_ENDPOINT,
      {
        model: resolveOcrModel(),
        prompt: buildPrompt(subjectType),
        image_urls: [imageUrl],
        temperature: 0.3,
        max_tokens: 24,
      },
      NAME_TIMEOUT_MS,
    );
    const out = visionOutputSchema.safeParse(data);
    if (!out.success) return null;
    // Nettoie : 1ʳᵉ ligne, sans guillemets, longueur bornée.
    const name = out.data.output
      .split('\n')[0]!
      .replace(/["«»]/g, '')
      .trim()
      .slice(0, MAX_NAME_LENGTH)
      .trim();
    return name.length > 0 ? name : null;
  } catch (err) {
    log?.warn(
      { error: err instanceof Error ? err.message : String(err) },
      'Nom auto du produit échoué — titre par défaut conservé',
    );
    return null;
  }
}
