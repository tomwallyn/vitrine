import { create } from 'zustand';

import type { BackgroundOption, MannequinOption, RenderType } from '@vitrine/shared';
import { MAX_BATCH_ITEMS } from '@vitrine/shared';

/** État d'un item du lot : upload GCS en cours / prêt / en échec. */
export type BatchItemStatus = 'uploading' | 'ready' | 'error';

/** Une pièce du lot : photo locale + URL GCS une fois l'upload terminé. */
export type BatchItem = {
  id: string;
  localUri: string;
  /** URL publique GCS (statut `ready` uniquement). */
  uploadedUrl?: string;
  status: BatchItemStatus;
};

/** Style commun appliqué à TOUT le lot (rendu, mannequin, fond). */
export type BatchStyle = {
  renderType: RenderType;
  mannequinOption: MannequinOption;
  backgroundOption: BackgroundOption;
  /** URL GCS du fond personnalisé (requise si backgroundOption === 'custom'). */
  customBackgroundUrl: string | null;
};

type BatchDraftState = {
  items: BatchItem[];
  style: BatchStyle;

  /**
   * Ajoute des photos locales au lot (statut `uploading`), plafonné à
   * MAX_BATCH_ITEMS au total. Renvoie les items réellement créés pour que
   * l'écran lance leurs uploads.
   */
  addItems: (localUris: string[]) => BatchItem[];
  removeItem: (id: string) => void;
  /** Relance d'upload après échec : repasse l'item en `uploading`. */
  setUploading: (id: string) => void;
  setUploaded: (id: string, uploadedUrl: string) => void;
  setUploadFailed: (id: string) => void;
  setStyle: (patch: Partial<BatchStyle>) => void;
  reset: () => void;
};

const defaultStyle: BatchStyle = {
  renderType: 'model',
  mannequinOption: 'femme',
  backgroundOption: 'studio',
  customBackgroundUrl: null,
};

let nextItemId = 0;
/** Id local unique d'un item (le lot vit le temps de l'écran, pas besoin d'uuid). */
function makeItemId(): string {
  nextItemId += 1;
  return `batch-item-${Date.now().toString(36)}-${nextItemId}`;
}

/**
 * Brouillon du mode « Lot de vêtements » (écran /batch) : photos du lot avec
 * l'état de leur upload GCS + style commun, jusqu'au POST /generations/batch.
 */
export const useBatchDraft = create<BatchDraftState>((set) => ({
  items: [],
  style: defaultStyle,

  addItems: (localUris) => {
    const created: BatchItem[] = [];
    set((state) => {
      const remaining = MAX_BATCH_ITEMS - state.items.length;
      if (remaining <= 0) return state;
      for (const localUri of localUris.slice(0, remaining)) {
        created.push({ id: makeItemId(), localUri, status: 'uploading' });
      }
      return { items: [...state.items, ...created] };
    });
    return created;
  },

  removeItem: (id) => set((state) => ({ items: state.items.filter((i) => i.id !== id) })),

  setUploading: (id) =>
    set((state) => ({
      items: state.items.map((i) => (i.id === id ? { ...i, status: 'uploading' as const } : i)),
    })),

  setUploaded: (id, uploadedUrl) =>
    set((state) => ({
      items: state.items.map((i) =>
        i.id === id ? { ...i, uploadedUrl, status: 'ready' as const } : i,
      ),
    })),

  setUploadFailed: (id) =>
    set((state) => ({
      items: state.items.map((i) => (i.id === id ? { ...i, status: 'error' as const } : i)),
    })),

  setStyle: (patch) => set((state) => ({ style: { ...state.style, ...patch } })),

  reset: () => set({ items: [], style: defaultStyle }),
}));
