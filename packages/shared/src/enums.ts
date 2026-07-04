import { z } from 'zod';

/** Type de rendu généré par l'IA (écran 03 — STYLE). */
export const renderTypeSchema = z.enum(['model', 'hanger', 'folded', 'studio']);
export type RenderType = z.infer<typeof renderTypeSchema>;
export const RENDER_TYPES = renderTypeSchema.options;

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
