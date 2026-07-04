import type { GarmentSlot, GarmentType } from '@vitrine/shared';

import { useBatchDraft } from './batch-draft';
import type { OutfitPiece, OutfitState } from './outfit';
import { useRenderDraft } from './render-draft';

/** Cible du sous-flux « Compléter la tenue » : brouillon photo unique ou lot. */
export type OutfitTarget = 'single' | 'batch';

export type OutfitController = {
  garmentType: GarmentType;
  outfit: OutfitState;
  setGarmentType: (garmentType: GarmentType) => void;
  setOutfitPiece: (slot: GarmentSlot, piece: OutfitPiece) => void;
  clearOutfitPiece: (slot: GarmentSlot) => void;
  /** Vignette de la pièce importée (photo unique) — absente en lot (tenue commune). */
  sourceThumb: string | null;
};

/**
 * Expose la tenue du bon brouillon (render-draft en photo unique, batch-draft
 * en lot) sous une interface uniforme, pour que les écrans /outfit* soient
 * agnostiques de la cible. Les valeurs sont réactives (sélecteurs), les actions
 * stables (getState()).
 */
export function useOutfitTarget(target: OutfitTarget): OutfitController {
  const renderGarmentType = useRenderDraft((s) => s.garmentType);
  const renderOutfit = useRenderDraft((s) => s.outfit);
  const renderLocalUri = useRenderDraft((s) => s.localUri);
  const batchGarmentType = useBatchDraft((s) => s.garmentType);
  const batchOutfit = useBatchDraft((s) => s.outfit);

  if (target === 'batch') {
    return {
      garmentType: batchGarmentType,
      outfit: batchOutfit,
      setGarmentType: useBatchDraft.getState().setGarmentType,
      setOutfitPiece: useBatchDraft.getState().setOutfitPiece,
      clearOutfitPiece: useBatchDraft.getState().clearOutfitPiece,
      sourceThumb: null,
    };
  }
  return {
    garmentType: renderGarmentType,
    outfit: renderOutfit,
    setGarmentType: useRenderDraft.getState().setGarmentType,
    setOutfitPiece: useRenderDraft.getState().setOutfitPiece,
    clearOutfitPiece: useRenderDraft.getState().clearOutfitPiece,
    sourceThumb: renderLocalUri,
  };
}
