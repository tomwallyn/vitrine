import { z } from 'zod';

import { subscribeToFal } from './client.js';

/**
 * Upscale ×2 **fidèle** du rendu final avant stockage (real-ESRGAN) : Nano Banana
 * sort en ~1024 px, on double la résolution pour un export plus net SANS
 * dénaturer les textures (super-résolution classique, pas de modèle créatif).
 *
 * Endpoint `fal-ai/esrgan` (slug vérifié sur fal.ai) :
 *   Input  : { image_url: string, scale?: number (déf. 2) }
 *   Output : { image: { url, ... } }
 *
 * TOUJOURS best-effort : {@link upscaleResultUrl} ne throw jamais — tout échec
 * renvoie l'URL d'origine (une génération ne doit jamais casser à cause de l'upscale).
 */
export const UPSCALE_ENDPOINT = 'fal-ai/esrgan';
const UPSCALE_SCALE = 2;
const UPSCALE_TIMEOUT_MS = 60_000;

const upscaleOutputSchema = z.object({ image: z.object({ url: z.string().url() }) });

type UpscaleLogger = { warn: (obj: unknown, msg?: string) => void };

/** Renvoie l'URL du rendu upscalé ×2, ou l'URL d'origine si l'upscale échoue. */
export async function upscaleResultUrl(imageUrl: string, log?: UpscaleLogger): Promise<string> {
  try {
    const data = await subscribeToFal(
      UPSCALE_ENDPOINT,
      { image_url: imageUrl, scale: UPSCALE_SCALE },
      UPSCALE_TIMEOUT_MS,
    );
    const parsed = upscaleOutputSchema.safeParse(data);
    if (parsed.success) return parsed.data.image.url;
    log?.warn({ data }, 'Upscale du rendu : sortie esrgan sans image — rendu original conservé');
    return imageUrl;
  } catch (err) {
    log?.warn(
      { error: err instanceof Error ? err.message : String(err) },
      'Upscale du rendu échoué — rendu original conservé',
    );
    return imageUrl;
  }
}
