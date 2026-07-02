import {
  DEFAULT_MANNEQUIN,
  MANNEQUIN_IMAGES,
  NANO_CUSTOM_BACKGROUND_SUFFIX,
  NANO_PROMPTS,
  type BackgroundOption,
  type MannequinOption,
  type Provider,
  type RenderType,
} from '@vitrine/shared';

/**
 * Adapters fal.ai — un par provider : construction de l'input (schémas vérifiés
 * dans @vitrine/shared/ai.ts) et extraction de l'URL du rendu depuis le payload
 * de sortie (reçu via le webhook fal).
 */

/** Paramètres d'une génération, indépendants du provider. */
export interface GenerationParams {
  sourceImageUrl: string;
  renderType: RenderType;
  mannequinOption: MannequinOption;
  backgroundOption: BackgroundOption;
  customBackgroundUrl?: string | null;
}

export interface ProviderAdapter {
  /** Payload `input` soumis à la queue fal. */
  buildInput(params: GenerationParams): Record<string, unknown>;
  /** Payload de sortie fal (webhook `payload` / `result.data`) → URL du rendu. */
  parseOutput(falResult: unknown): { imageUrl: string };
}

/** Payload fal sans URL exploitable → erreur explicite (génération à marquer failed). */
export class AiOutputParseError extends Error {
  constructor(provider: Provider, falResult: unknown) {
    super(
      `Sortie fal sans URL d'image pour ${provider} : ${JSON.stringify(falResult).slice(0, 300)}`,
    );
    this.name = 'AiOutputParseError';
  }
}

/**
 * Image du mannequin pour le try-on. `studio` n'a pas d'image (le router route
 * ce cas vers Nano Banana) — repli défensif sur DEFAULT_MANNEQUIN si atteint.
 */
function mannequinImageUrl(option: MannequinOption): string {
  return option === 'studio' ? MANNEQUIN_IMAGES[DEFAULT_MANNEQUIN] : MANNEQUIN_IMAGES[option];
}

/** FASHN v1.6 : { model_image, garment_image } → images[0].url */
const fashnAdapter: ProviderAdapter = {
  buildInput(params) {
    return {
      model_image: mannequinImageUrl(params.mannequinOption),
      garment_image: params.sourceImageUrl,
      // Les photos sources VITRINE sont des vêtements sur cintre (≈ flat-lay).
      garment_photo_type: 'flat-lay',
      mode: 'balanced',
      output_format: 'png',
    };
  },
  parseOutput(falResult) {
    const data = falResult as { images?: Array<{ url?: string } | undefined> } | null | undefined;
    const url = data?.images?.[0]?.url;
    if (!url) throw new AiOutputParseError('fashn', falResult);
    return { imageUrl: url };
  },
};

/** Kling Kolors : { human_image_url, garment_image_url } → image.url (objet unique) */
const klingAdapter: ProviderAdapter = {
  buildInput(params) {
    return {
      human_image_url: mannequinImageUrl(params.mannequinOption),
      garment_image_url: params.sourceImageUrl,
    };
  },
  parseOutput(falResult) {
    const data = falResult as { image?: { url?: string } } | null | undefined;
    const url = data?.image?.url;
    if (!url) throw new AiOutputParseError('kling', falResult);
    return { imageUrl: url };
  },
};

/**
 * Prompt Nano Banana par type de rendu. `model` n'arrive ici que via le repli
 * mannequin=studio (ghost mannequin) → prompt `studio`.
 */
function nanoPrompt(params: GenerationParams): string {
  const base = params.renderType === 'model' ? NANO_PROMPTS.studio : NANO_PROMPTS[params.renderType];
  const hasCustomBackground = params.backgroundOption === 'custom' && !!params.customBackgroundUrl;
  return hasCustomBackground ? base + NANO_CUSTOM_BACKGROUND_SUFFIX : base;
}

/** Nano Banana Pro edit : { prompt, image_urls: [source, fond?] } → images[0].url */
const nanobananaAdapter: ProviderAdapter = {
  buildInput(params) {
    const customBackground =
      params.backgroundOption === 'custom' && params.customBackgroundUrl
        ? [params.customBackgroundUrl]
        : [];
    return {
      prompt: nanoPrompt(params),
      image_urls: [params.sourceImageUrl, ...customBackground],
      num_images: 1,
      output_format: 'png',
    };
  },
  parseOutput(falResult) {
    const data = falResult as { images?: Array<{ url?: string } | undefined> } | null | undefined;
    const url = data?.images?.[0]?.url;
    if (!url) throw new AiOutputParseError('nanobanana', falResult);
    return { imageUrl: url };
  },
};

export const ADAPTERS: Record<Provider, ProviderAdapter> = {
  fashn: fashnAdapter,
  kling: klingAdapter,
  nanobanana: nanobananaAdapter,
};
