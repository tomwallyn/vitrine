import { z } from 'zod';

/** Type de sujet du visuel : vêtement (habillage) ou objet (mise en scène). */
export const subjectTypeSchema = z.enum(['vetement', 'objet']);
export type SubjectType = z.infer<typeof subjectTypeSchema>;
export const SUBJECT_TYPES = subjectTypeSchema.options;

/**
 * Type de rendu généré par l'IA. Les 4 premiers sont réservés aux **vêtements**
 * (écran 06), les 6 suivants aux **objets** (v2) — `subjectType` désambiguïse.
 */
export const renderTypeSchema = z.enum([
  // Vêtement
  'model',
  'hanger',
  'folded',
  'studio',
  // Objet (v2)
  'studio_uni',
  'texture',
  'mise_en_situation',
  'ambiance',
  'macro',
  'exterieur',
]);
export type RenderType = z.infer<typeof renderTypeSchema>;
export const RENDER_TYPES = renderTypeSchema.options;

/** Types de rendu réservés aux objets (le reste = vêtement). */
export const OBJECT_RENDER_TYPES = [
  'studio_uni',
  'texture',
  'mise_en_situation',
  'ambiance',
  'macro',
  'exterieur',
] as const;
export type ObjectRenderType = (typeof OBJECT_RENDER_TYPES)[number];

/** Types de rendu vêtement (sélecteur de style côté mode). */
export const CLOTHING_RENDER_TYPES = ['model', 'hanger', 'folded', 'studio'] as const;

/** Vrai si le type de rendu est un rendu objet. */
export function isObjectRenderType(rt: RenderType): rt is ObjectRenderType {
  return (OBJECT_RENDER_TYPES as readonly string[]).includes(rt);
}

/** Ambiance lumière du rendu objet (écran OBJET·1). */
export const sceneLightingSchema = z.enum(['douce', 'doree', 'contrastee']);
export type SceneLighting = z.infer<typeof sceneLightingSchema>;
export const SCENE_LIGHTINGS = sceneLightingSchema.options;

/** Option de mannequin (écran 03 — MANNEQUIN). */
export const mannequinOptionSchema = z.enum(['femme', 'homme', 'silhouette', 'studio']);
export type MannequinOption = z.infer<typeof mannequinOptionSchema>;
export const MANNEQUIN_OPTIONS = mannequinOptionSchema.options;

/** Option de fond (écran 03 — FOND) : studio ou fond personnalisé uploadé. */
export const backgroundOptionSchema = z.enum(['studio', 'custom']);
export type BackgroundOption = z.infer<typeof backgroundOptionSchema>;
export const BACKGROUND_OPTIONS = backgroundOptionSchema.options;

/**
 * Type générique de la pièce importée pour le rendu « sur modèle » (1 clic) :
 * détermine les slots à compléter (haut→bas+chaussures, bas→haut+chaussures,
 * robe→chaussures). Cf. feature « Compléter la tenue ».
 */
export const garmentTypeSchema = z.enum(['haut', 'bas', 'robe']);
export type GarmentType = z.infer<typeof garmentTypeSchema>;
export const GARMENT_TYPES = garmentTypeSchema.options;

/** Slot d'une pièce de garde-robe (suggestions par défaut + pièces custom sauvegardées). */
export const garmentSlotSchema = z.enum(['haut', 'bas', 'chaussures']);
export type GarmentSlot = z.infer<typeof garmentSlotSchema>;
export const GARMENT_SLOTS = garmentSlotSchema.options;

/** Statut du pipeline de génération asynchrone (écran 04 — polling). */
export const generationStatusSchema = z.enum(['queued', 'processing', 'done', 'failed']);
export type GenerationStatus = z.infer<typeof generationStatusSchema>;
export const GENERATION_STATUSES = generationStatusSchema.options;

/** Provider IA via fal.ai (router modèle par type de rendu). */
export const providerSchema = z.enum(['fashn', 'kling', 'nanobanana']);
export type Provider = z.infer<typeof providerSchema>;
export const PROVIDERS = providerSchema.options;

/** Raison d'une ligne du ledger de crédits (append-only). */
export const ledgerReasonSchema = z.enum([
  'purchase',
  'generation_hold',
  'generation_commit',
  'refund',
  'bonus',
]);
export type LedgerReason = z.infer<typeof ledgerReasonSchema>;
