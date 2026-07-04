import type { GarmentSlot, GarmentType, GenerationOutfit } from '@vitrine/shared';

/** État d'upload d'une pièce (même sémantique que les autres uploads). */
export type OutfitUploadStatus = 'idle' | 'uploading' | 'done' | 'error';

/** Une pièce choisie pour un slot de la tenue (suggestion par défaut ou custom). */
export type OutfitPiece = {
  /** URL canonique envoyée à la génération (CDN défaut / GCS custom). null pendant l'upload. */
  url: string | null;
  /** Vignette à afficher (image locale pendant upload, displayUrl signé, ou url CDN). */
  thumbUrl: string | null;
  status: OutfitUploadStatus;
};

/** Tenue = une pièce (au plus) par slot haut/bas/chaussures. */
export type OutfitState = Partial<Record<GarmentSlot, OutfitPiece>>;

/** Libellés FR des slots de garde-robe. */
export const SLOT_LABEL: Record<GarmentSlot, string> = {
  haut: 'Haut',
  bas: 'Bas',
  chaussures: 'Chaussures',
};

/** Libellés FR du type générique de la pièce importée. */
export const GARMENT_TYPE_LABEL: Record<GarmentType, string> = {
  haut: 'Haut',
  bas: 'Bas',
  robe: 'Robe',
};

/**
 * Slot occupé par la pièce importée (verrouillé sur l'écran « La tenue »).
 * `robe` couvre haut+bas → pas de slot haut/bas à compléter.
 */
export function lockedSlot(type: GarmentType): GarmentSlot | null {
  if (type === 'haut') return 'haut';
  if (type === 'bas') return 'bas';
  return null;
}

/** Slots à compléter selon le type importé, avec leur obligation. */
export function completionSlots(type: GarmentType): { slot: GarmentSlot; required: boolean }[] {
  if (type === 'haut') {
    return [
      { slot: 'bas', required: true },
      { slot: 'chaussures', required: false },
    ];
  }
  if (type === 'bas') {
    return [
      { slot: 'haut', required: true },
      { slot: 'chaussures', required: false },
    ];
  }
  return [{ slot: 'chaussures', required: false }];
}

/** Map slot garde-robe → clé du contrat `GenerationOutfit`. */
const SLOT_TO_OUTFIT_KEY: Record<GarmentSlot, keyof GenerationOutfit> = {
  haut: 'top',
  bas: 'bottom',
  chaussures: 'shoes',
};

/** Tenue du store → payload `GenerationOutfit` (URLs canoniques). undefined si vide. */
export function outfitToPayload(outfit: OutfitState): GenerationOutfit | undefined {
  const payload: GenerationOutfit = {};
  for (const slot of Object.keys(outfit) as GarmentSlot[]) {
    const url = outfit[slot]?.url;
    if (url) payload[SLOT_TO_OUTFIT_KEY[slot]] = url;
  }
  return Object.keys(payload).length > 0 ? payload : undefined;
}

/** Le slot requis (selon le type) est-il rempli ? (garde le CTA « Continuer »). */
export function requiredSlotFilled(type: GarmentType, outfit: OutfitState): boolean {
  const required = completionSlots(type).find((s) => s.required);
  if (!required) return true;
  return !!outfit[required.slot]?.url;
}

/** Une pièce est-elle en cours d'upload ? (bloque le CTA). */
export function outfitUploading(outfit: OutfitState): boolean {
  return Object.values(outfit).some((p) => p?.status === 'uploading');
}
