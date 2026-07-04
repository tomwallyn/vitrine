import sharp from 'sharp';

/**
 * Upscale ×2 **fidèle** du rendu final avant stockage : agrandissement **Lanczos**
 * (interpolation locale, PAS d'IA) → export plus grand et net (~1024→2048 px)
 * SANS dénaturer visages, mains ni textures. Choix produit : fidélité stricte —
 * les upscalers IA (esrgan/aura) altéraient les visages, on ne les utilise pas.
 *
 * Best-effort : {@link upscaleResultBuffer} ne throw jamais — tout échec renvoie
 * le buffer d'origine (une génération ne doit jamais casser à cause de l'upscale).
 */
const UPSCALE_FACTOR = 2;

type UpscaleLogger = { warn: (obj: unknown, msg?: string) => void };

/** Rendu → même image agrandie ×2 (Lanczos + léger sharpen), ou l'originale si échec. */
export async function upscaleResultBuffer(
  input: Buffer,
  contentType: string | null,
  log?: UpscaleLogger,
): Promise<{ data: Buffer; contentType: string | null }> {
  try {
    const img = sharp(input, { failOn: 'none' });
    const meta = await img.metadata();
    if (!meta.width || !meta.height) return { data: input, contentType };
    const data = await img
      .resize({
        width: meta.width * UPSCALE_FACTOR,
        height: meta.height * UPSCALE_FACTOR,
        kernel: 'lanczos3',
      })
      .sharpen({ sigma: 0.6 })
      .png()
      .toBuffer();
    return { data, contentType: 'image/png' };
  } catch (err) {
    log?.warn(
      { error: err instanceof Error ? err.message : String(err) },
      'Upscale Lanczos du rendu échoué — rendu original conservé',
    );
    return { data: input, contentType };
  }
}
