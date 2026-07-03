import { productInfoSchema, type ProductInfo } from '@vitrine/shared';
import { z } from 'zod';

import { subscribeToFal } from './client.js';

/**
 * OCR de fiche produit — lit la photo d'étiquette (et/ou de détail matière)
 * d'une génération avec un modèle **vision** hébergé sur fal et en extrait une
 * fiche produit structurée { matiere?, taille?, couleur?, composition?,
 * entretien?, description } (cf. productInfoSchema de @vitrine/shared).
 *
 * Endpoint : `openrouter/router/vision` (slug vérifié sur fal.ai le 2026-07-03,
 * types générés dans @fal-ai/client 1.10.1 — successeur de fal-ai/any-llm/vision) :
 *   Input  : { prompt, image_urls: string[], model, system_prompt?,
 *              temperature?, max_tokens?, reasoning? }
 *   Output : { output: string, usage: { ... } }
 * `model` est un id de modèle OpenRouter, facturé à l'usage réel de tokens.
 *
 * TOUJOURS best-effort : {@link extractProductInfo} ne throw jamais (→ null),
 * l'OCR ne doit jamais bloquer ni faire échouer un rendu.
 */

/** Slug fal du endpoint vision → texte utilisé pour l'OCR. */
export const PRODUCT_OCR_ENDPOINT = 'openrouter/router/vision';

/** Modèle vision par défaut (rapide, bon rapport qualité/prix pour de l'OCR). */
const DEFAULT_OCR_MODEL = 'google/gemini-2.5-flash';

/** Modèle vision de l'OCR (id OpenRouter) — surchargeable via AI_OCR_MODEL. */
export function resolveOcrModel(): string {
  return process.env.AI_OCR_MODEL || DEFAULT_OCR_MODEL;
}

/** Timeout de l'appel vision : l'OCR est un bonus, on abandonne vite. */
const OCR_TIMEOUT_MS = 60_000;

const OCR_SYSTEM_PROMPT =
  'Tu lis des photos d’étiquettes et de détails de vêtements pour une boutique de mode. ' +
  'Tu réponds UNIQUEMENT avec un objet JSON strict, sans texte autour et sans bloc markdown.';

const OCR_PROMPT =
  'Analyse ces photos (étiquette de vêtement et/ou détail de la matière) et renvoie un objet JSON de la forme : ' +
  '{"matiere": string|null, "taille": string|null, "couleur": string|null, ' +
  '"composition": string|null, "entretien": string|null, "description": string}. ' +
  'Règles : matiere = matière principale (ex. "coton") ; taille = taille lisible sur l’étiquette (ex. "M", "42") ; ' +
  'couleur = couleur dominante du vêtement ; composition = composition détaillée avec pourcentages si lisibles ' +
  '(ex. "80% coton, 20% polyester") ; entretien = consignes d’entretien lisibles (ex. "lavage 30°C, pas de sèche-linge") ; ' +
  'description = OBLIGATOIRE, courte description produit en français (1 à 2 phrases, ton e-commerce). ' +
  'Mets null pour tout champ illisible ou absent des images. N’invente RIEN. Réponds uniquement le JSON.';

/** Champ texte tolérant : null / vide / non-string → champ omis. */
const looseField = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() ? v.trim() : undefined),
  z.string().optional(),
);

/** JSON attendu du modèle — tous les champs tolérants sauf `description`. */
const ocrJsonSchema = z.object({
  matiere: looseField,
  taille: looseField,
  couleur: looseField,
  composition: looseField,
  entretien: looseField,
  description: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() ? v.trim() : undefined),
    z.string().min(1),
  ),
});

/** Sortie du endpoint `openrouter/router/vision` (texte généré). */
const visionOutputSchema = z.object({ output: z.string() });

/** Logger minimal optionnel (compatible pino / req.log). */
type OcrLogger = { warn: (obj: unknown, msg?: string) => void };

/**
 * Extrait le premier bloc JSON d'une réponse texte du modèle (tolère les
 * fences markdown et le texte autour) et le valide contre le contrat partagé.
 *
 * @returns la fiche produit validée, ou null si le texte est inexploitable
 * (pas de JSON, JSON invalide, `description` manquante).
 */
export function parseProductInfoText(text: string): ProductInfo | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;

  let raw: unknown;
  try {
    raw = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }

  const parsed = ocrJsonSchema.safeParse(raw);
  if (!parsed.success) return null;

  // Objet propre (les champs vides sont omis, pas de clés undefined en jsonb).
  const info: ProductInfo = { description: parsed.data.description };
  if (parsed.data.matiere) info.matiere = parsed.data.matiere;
  if (parsed.data.taille) info.taille = parsed.data.taille;
  if (parsed.data.couleur) info.couleur = parsed.data.couleur;
  if (parsed.data.composition) info.composition = parsed.data.composition;
  if (parsed.data.entretien) info.entretien = parsed.data.entretien;

  const validated = productInfoSchema.safeParse(info);
  return validated.success ? validated.data : null;
}

/**
 * Lit l'étiquette (et/ou le détail matière) avec le modèle vision fal et
 * extrait la fiche produit. Les URLs doivent être des **URLs signées GET**
 * (bucket GCS privé : fal doit pouvoir télécharger les images) — l'étiquette
 * est passée en premier, le détail en complément.
 *
 * Ne throw JAMAIS : tout échec (fal indisponible, timeout, réponse
 * inexploitable) est loggé en warn et renvoie null — l'OCR est non bloquant.
 */
export async function extractProductInfo(
  labelUrl: string | null | undefined,
  detailUrl?: string | null,
  log?: OcrLogger,
): Promise<ProductInfo | null> {
  const imageUrls = [labelUrl, detailUrl].filter((url): url is string => !!url);
  if (imageUrls.length === 0) return null;

  try {
    const data = await subscribeToFal(
      PRODUCT_OCR_ENDPOINT,
      {
        model: resolveOcrModel(),
        prompt: OCR_PROMPT,
        system_prompt: OCR_SYSTEM_PROMPT,
        image_urls: imageUrls,
        temperature: 0,
        max_tokens: 800,
      },
      OCR_TIMEOUT_MS,
    );

    const output = visionOutputSchema.safeParse(data);
    if (!output.success) {
      log?.warn({ data }, 'OCR étiquette : sortie vision fal sans champ output — ignorée');
      return null;
    }

    const info = parseProductInfoText(output.data.output);
    if (!info) {
      log?.warn(
        { output: output.data.output.slice(0, 300) },
        'OCR étiquette : réponse du modèle sans JSON exploitable — ignorée',
      );
    }
    return info;
  } catch (err) {
    log?.warn(
      { error: err instanceof Error ? err.message : String(err) },
      'OCR étiquette : appel vision fal échoué — ignoré',
    );
    return null;
  }
}
