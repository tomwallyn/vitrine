import { create } from 'zustand';

import type {
  BackgroundOption,
  CreateGenerationRequest,
  GenerationExtraImages,
  MannequinOption,
  RenderType,
} from '@vitrine/shared';

/** État d'un upload GCS (photo source ou fond personnalisé). */
export type UploadStatus = 'idle' | 'uploading' | 'done' | 'error';

type RenderDraftState = {
  /** URI locale de la photo (capture ou import galerie). */
  localUri: string | null;
  /** URL publique GCS de la source une fois l'upload terminé. */
  sourceUrl: string | null;
  sourceObjectPath: string | null;
  sourceUploadStatus: UploadStatus;
  sourceUploadError: string | null;
  /**
   * Vues additionnelles du MÊME vêtement (multi-détails, écran Angles) —
   * URLs GCS déjà uploadées, jointes à POST /generations. null = flux 1 photo.
   */
  extraImages: GenerationExtraImages | null;

  renderType: RenderType;
  mannequinOption: MannequinOption;
  backgroundOption: BackgroundOption;
  /** URI locale du fond personnalisé (vignette pendant/après upload). */
  customBackgroundLocalUri: string | null;
  /** URL publique GCS du fond personnalisé (backgroundOption === 'custom'). */
  customBackgroundUrl: string | null;
  customBackgroundUploadStatus: UploadStatus;
  customBackgroundUploadError: string | null;

  /** Garde anti-écrasement : les préréglages boutique ne s'appliquent qu'une fois. */
  settingsApplied: boolean;
  /** Payload validé au moment de « Générer » — consommé par POST /generations (M3). */
  pendingGeneration: CreateGenerationRequest | null;

  /** Nouvelle photo → réinitialise le brouillon et repart des défauts. */
  startDraft: (localUri: string) => void;
  setSourceUploading: () => void;
  setSourceUploaded: (publicUrl: string, objectPath: string) => void;
  setSourceUploadFailed: (message: string) => void;
  /** Attache les vues additionnelles (multi-détails) au brouillon courant. */
  setExtraImages: (extraImages: GenerationExtraImages | null) => void;

  setRenderType: (renderType: RenderType) => void;
  setMannequinOption: (mannequinOption: MannequinOption) => void;
  setBackgroundOption: (backgroundOption: BackgroundOption) => void;
  setCustomBackgroundUploading: (localUri: string) => void;
  setCustomBackgroundUploaded: (publicUrl: string) => void;
  setCustomBackgroundUploadFailed: (message: string) => void;
  /** Sélectionne un fond réutilisable déjà uploadé (GET /backgrounds). */
  selectExistingBackground: (imageUrl: string) => void;

  applyShopDefaults: (defaults: {
    defaultRenderType?: RenderType;
    defaultMannequinOption?: MannequinOption;
    defaultBackgroundOption?: BackgroundOption;
  }) => void;
  setPendingGeneration: (payload: CreateGenerationRequest) => void;
  reset: () => void;
};

const initialState = {
  localUri: null,
  sourceUrl: null,
  sourceObjectPath: null,
  sourceUploadStatus: 'idle' as UploadStatus,
  sourceUploadError: null,
  extraImages: null as GenerationExtraImages | null,
  renderType: 'model' as RenderType,
  mannequinOption: 'femme' as MannequinOption,
  backgroundOption: 'studio' as BackgroundOption,
  customBackgroundLocalUri: null,
  customBackgroundUrl: null,
  customBackgroundUploadStatus: 'idle' as UploadStatus,
  customBackgroundUploadError: null,
  settingsApplied: false,
  pendingGeneration: null,
};

/**
 * Brouillon de rendu (écrans 02 → 03) : porte la photo capturée, l'état des
 * uploads GCS et la configuration STYLE / MANNEQUIN / FOND jusqu'à la
 * génération (M3).
 */
export const useRenderDraft = create<RenderDraftState>((set) => ({
  ...initialState,

  startDraft: (localUri) => set({ ...initialState, localUri }),
  setSourceUploading: () =>
    set({ sourceUploadStatus: 'uploading', sourceUploadError: null }),
  setSourceUploaded: (publicUrl, objectPath) =>
    set({
      sourceUrl: publicUrl,
      sourceObjectPath: objectPath,
      sourceUploadStatus: 'done',
      sourceUploadError: null,
    }),
  setSourceUploadFailed: (message) =>
    set({ sourceUploadStatus: 'error', sourceUploadError: message }),
  setExtraImages: (extraImages) => set({ extraImages }),

  setRenderType: (renderType) => set({ renderType }),
  setMannequinOption: (mannequinOption) => set({ mannequinOption }),
  setBackgroundOption: (backgroundOption) => set({ backgroundOption }),
  setCustomBackgroundUploading: (localUri) =>
    set({
      customBackgroundLocalUri: localUri,
      customBackgroundUploadStatus: 'uploading',
      customBackgroundUploadError: null,
    }),
  setCustomBackgroundUploaded: (publicUrl) =>
    set({
      customBackgroundUrl: publicUrl,
      customBackgroundUploadStatus: 'done',
      customBackgroundUploadError: null,
    }),
  setCustomBackgroundUploadFailed: (message) =>
    set({ customBackgroundUploadStatus: 'error', customBackgroundUploadError: message }),
  selectExistingBackground: (imageUrl) =>
    set({
      backgroundOption: 'custom',
      customBackgroundLocalUri: imageUrl,
      customBackgroundUrl: imageUrl,
      customBackgroundUploadStatus: 'done',
      customBackgroundUploadError: null,
    }),

  applyShopDefaults: (defaults) =>
    set((state) => {
      if (state.settingsApplied) return state;
      return {
        settingsApplied: true,
        ...(defaults.defaultRenderType ? { renderType: defaults.defaultRenderType } : {}),
        ...(defaults.defaultMannequinOption
          ? { mannequinOption: defaults.defaultMannequinOption }
          : {}),
        // « custom » présélectionne l'option, le fond lui-même restant à
        // choisir (Mes fonds / upload) — le CTA reste bloqué tant qu'il manque.
        ...(defaults.defaultBackgroundOption
          ? { backgroundOption: defaults.defaultBackgroundOption }
          : {}),
      };
    }),
  setPendingGeneration: (payload) => set({ pendingGeneration: payload }),
  reset: () => set({ ...initialState }),
}));
