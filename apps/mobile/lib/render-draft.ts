import { create } from 'zustand';

import type {
  BackgroundOption,
  CreateGenerationRequest,
  GarmentSlot,
  GarmentType,
  GenerationExtraImages,
  MannequinOption,
  RenderType,
  SceneLighting,
  SubjectType,
} from '@vitrine/shared';

import type { OutfitPiece, OutfitState } from './outfit';
import { EMPTY_SCENE, type SceneState } from './scene';

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

  /** Type de sujet du visuel (vêtement/objet) — fixé par l'écran de fork. */
  subjectType: SubjectType;
  renderType: RenderType;
  mannequinOption: MannequinOption;
  /** Variante de mannequin choisie dans la catégorie (null = 1ʳᵉ par défaut). */
  mannequinId: string | null;
  backgroundOption: BackgroundOption;
  /** URI locale du fond personnalisé (vignette pendant/après upload). */
  customBackgroundLocalUri: string | null;
  /** URL publique GCS du fond personnalisé (backgroundOption === 'custom'). */
  customBackgroundUrl: string | null;
  customBackgroundUploadStatus: UploadStatus;
  customBackgroundUploadError: string | null;

  /**
   * « Compléter la tenue » (rendu « sur modèle ») — type générique de la pièce
   * importée (Haut/Bas/Robe) et pièces de complétion choisies par slot.
   */
  garmentType: GarmentType;
  outfit: OutfitState;
  /** Vrai dès que l'utilisateur choisit le type à la main → bloque l'auto-détection. */
  garmentTypeTouched: boolean;

  /** OBJET — ambiance lumière + configuration de scène (« Compléter la scène »). */
  lighting: SceneLighting;
  scene: SceneState;

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
  /** Change de catégorie de mannequin — réinitialise la variante choisie. */
  setMannequinOption: (mannequinOption: MannequinOption) => void;
  /** Choisit une variante précise de mannequin (vignette). */
  setMannequinId: (mannequinId: string) => void;
  setBackgroundOption: (backgroundOption: BackgroundOption) => void;
  setCustomBackgroundUploading: (localUri: string) => void;
  setCustomBackgroundUploaded: (publicUrl: string) => void;
  setCustomBackgroundUploadFailed: (message: string) => void;
  /** Sélectionne un fond réutilisable déjà uploadé (GET /backgrounds). */
  selectExistingBackground: (imageUrl: string) => void;

  /** Fixe le type de sujet (fork Vêtement/Objet) — remet un renderType par défaut adapté. */
  setSubjectType: (subjectType: SubjectType) => void;
  /** OBJET — ambiance lumière. */
  setLighting: (lighting: SceneLighting) => void;
  /** OBJET — modifie la config de scène (surface/décor/accessoires/décor perso). */
  setScene: (patch: Partial<SceneState>) => void;

  /** Type de pièce importée (choix MANUEL) — réinitialise la tenue + verrouille l'auto. */
  setGarmentType: (garmentType: GarmentType) => void;
  /** Type deviné par l'IA — appliqué seulement si l'utilisateur n'a pas choisi à la main. */
  setGarmentTypeAuto: (garmentType: GarmentType) => void;
  /** Choisit/remplace la pièce d'un slot de la tenue. */
  setOutfitPiece: (slot: GarmentSlot, piece: OutfitPiece) => void;
  /** Retire la pièce d'un slot. */
  clearOutfitPiece: (slot: GarmentSlot) => void;

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
  subjectType: 'vetement' as SubjectType,
  renderType: 'studio' as RenderType,
  mannequinOption: 'femme' as MannequinOption,
  mannequinId: null as string | null,
  backgroundOption: 'studio' as BackgroundOption,
  customBackgroundLocalUri: null,
  customBackgroundUrl: null,
  customBackgroundUploadStatus: 'idle' as UploadStatus,
  customBackgroundUploadError: null,
  garmentType: 'haut' as GarmentType,
  outfit: {} as OutfitState,
  garmentTypeTouched: false,
  lighting: 'douce' as SceneLighting,
  scene: EMPTY_SCENE as SceneState,
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

  // Nouvelle photo → réinitialise mais PRÉSERVE le type de sujet (choisi au fork)
  // et repart d'un renderType par défaut adapté (objet → mise en situation).
  startDraft: (localUri) =>
    set((s) => ({
      ...initialState,
      subjectType: s.subjectType,
      renderType: s.subjectType === 'objet' ? 'mise_en_situation' : 'studio',
      localUri,
    })),
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
  setMannequinOption: (mannequinOption) => set({ mannequinOption, mannequinId: null }),
  setMannequinId: (mannequinId) => set({ mannequinId }),
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

  setSubjectType: (subjectType) =>
    set({
      subjectType,
      renderType: subjectType === 'objet' ? 'mise_en_situation' : 'studio',
      scene: EMPTY_SCENE,
      outfit: {},
      garmentTypeTouched: false,
    }),
  setLighting: (lighting) => set({ lighting }),
  setScene: (patch) => set((s) => ({ scene: { ...s.scene, ...patch } })),

  setGarmentType: (garmentType) => set({ garmentType, outfit: {}, garmentTypeTouched: true }),
  setGarmentTypeAuto: (garmentType) =>
    set((s) => (s.garmentTypeTouched ? s : { garmentType, outfit: {} })),
  setOutfitPiece: (slot, piece) => set((s) => ({ outfit: { ...s.outfit, [slot]: piece } })),
  clearOutfitPiece: (slot) =>
    set((s) => {
      const next = { ...s.outfit };
      delete next[slot];
      return { outfit: next };
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
