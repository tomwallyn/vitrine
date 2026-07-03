import {
  DEFAULT_MANNEQUIN,
  MANNEQUIN_IMAGES,
  NANO_CUSTOM_BACKGROUND_LAST_SUFFIX,
  NANO_CUSTOM_BACKGROUND_SUFFIX,
  NANO_MODEL_BG_STUDIO,
  NANO_MODEL_DRESS_PROMPT,
  NANO_MULTI_VIEW_SUFFIX,
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
  /**
   * Vues additionnelles du MÊME vêtement (URLs **signées GET**, comme la
   * source) — utilisées par Nano Banana pour un rendu plus fidèle, ignorées
   * par les try-on FASHN/Kling (1 seule image vêtement). L'étiquette (`label`)
   * n'arrive jamais ici : stockée en base pour l'OCR, hors rendu.
   */
  extraImageUrls?: { back?: string; detail?: string } | null;
}

/** Vues additionnelles à passer au rendu, dans un ordre stable (arrière, détail). */
function extraViewUrls(params: GenerationParams): string[] {
  return [params.extraImageUrls?.back, params.extraImageUrls?.detail].filter(
    (url): url is string => !!url,
  );
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

/**
 * Rendu « sur modèle » avec un mannequin de référence (femme/homme/silhouette) :
 * servi par Nano Banana (habillage), le mannequin devient la 1ʳᵉ image. Le cas
 * mannequin=`studio` reste un packshot ghost (pas de personne).
 */
function isModelDress(params: GenerationParams): boolean {
  return params.renderType === 'model' && params.mannequinOption !== 'studio';
}

/**
 * FASHN v1.6 : { model_image, garment_image } → images[0].url
 * Le try-on ne prend qu'UNE image vêtement : seule la vue avant (source) est
 * utilisée, les `extraImageUrls` sont ignorées.
 */
const fashnAdapter: ProviderAdapter = {
  buildInput(params) {
    return {
      model_image: mannequinImageUrl(params.mannequinOption),
      garment_image: params.sourceImageUrl,
      // Les photos sources VITRINE sont des vêtements sur cintre (≈ flat-lay).
      garment_photo_type: 'flat-lay',
      // Meilleure qualité de rendu (plus lent, acceptable pour un visuel produit).
      mode: 'quality',
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

/**
 * Kling Kolors : { human_image_url, garment_image_url } → image.url (objet unique)
 * Comme FASHN, une seule image vêtement : `extraImageUrls` ignorées.
 */
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
 * Prompt Nano Banana par type de rendu :
 * - `model` + mannequin femme/homme/silhouette → prompt d'habillage (le mannequin
 *   est la 1ʳᵉ image, cf. {@link isModelDress}) ;
 * - `model` + mannequin `studio` → packshot ghost (prompt `studio`, pas de personne) ;
 * - `hanger`/`folded`/`studio` → prompt de fidélité par type.
 *
 * Multi-détails : si des vues additionnelles sont fournies, le prompt indique
 * qu'il s'agit de plusieurs vues du MÊME vêtement à combiner ; le suffixe fond
 * custom pointe alors vers la DERNIÈRE image (le fond n'est plus la 2ᵉ).
 */
function nanoPrompt(params: GenerationParams): string {
  const hasExtraViews = extraViewUrls(params).length > 0;
  const hasCustomBackground = params.backgroundOption === 'custom' && !!params.customBackgroundUrl;

  // « Sur modèle » : on habille le mannequin (1ʳᵉ image) avec le vêtement.
  if (isModelDress(params)) {
    let prompt = NANO_MODEL_DRESS_PROMPT;
    if (hasExtraViews) prompt += NANO_MULTI_VIEW_SUFFIX;
    return prompt + (hasCustomBackground ? NANO_CUSTOM_BACKGROUND_LAST_SUFFIX : NANO_MODEL_BG_STUDIO);
  }

  const base = params.renderType === 'model' ? NANO_PROMPTS.studio : NANO_PROMPTS[params.renderType];
  const prompt = hasExtraViews ? base + NANO_MULTI_VIEW_SUFFIX : base;
  if (!hasCustomBackground) return prompt;
  return prompt + (hasExtraViews ? NANO_CUSTOM_BACKGROUND_LAST_SUFFIX : NANO_CUSTOM_BACKGROUND_SUFFIX);
}

/**
 * Nano Banana Pro edit :
 * { prompt, image_urls: [source, arrière?, détail?, fond?] } → images[0].url
 */
const nanobananaAdapter: ProviderAdapter = {
  buildInput(params) {
    const extraViews = extraViewUrls(params);
    const customBackground =
      params.backgroundOption === 'custom' && params.customBackgroundUrl
        ? [params.customBackgroundUrl]
        : [];
    // « Sur modèle » : le mannequin de référence est la 1ʳᵉ image (Nano l'habille),
    // puis le vêtement (source + vues), et enfin le fond custom éventuel.
    const mannequin = isModelDress(params) ? [mannequinImageUrl(params.mannequinOption)] : [];
    return {
      prompt: nanoPrompt(params),
      image_urls: [...mannequin, params.sourceImageUrl, ...extraViews, ...customBackground],
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
