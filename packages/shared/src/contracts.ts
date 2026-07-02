import { z } from 'zod';
import {
  backgroundOptionSchema,
  generationStatusSchema,
  ledgerReasonSchema,
  mannequinOptionSchema,
  providerSchema,
  renderTypeSchema,
} from './enums.js';

// ─────────────────────────────────────────────────────────────────
// Generation — POST /generations · GET /generations/:id
// ─────────────────────────────────────────────────────────────────

export const createGenerationRequestSchema = z.object({
  /** URL GCS de la photo source (obtenue via POST /uploads/sign). */
  sourceImageUrl: z.string().url(),
  renderType: renderTypeSchema,
  mannequinOption: mannequinOptionSchema,
  backgroundOption: backgroundOptionSchema.default('studio'),
  /** Requis si backgroundOption === 'custom' (fond uploadé réutilisable). */
  customBackgroundUrl: z.string().url().optional(),
});
export type CreateGenerationRequest = z.infer<typeof createGenerationRequestSchema>;

export const generationSchema = z.object({
  id: z.string().uuid(),
  shopId: z.string().uuid(),
  sourceImageUrl: z.string().url(),
  renderType: renderTypeSchema,
  mannequinOption: mannequinOptionSchema,
  backgroundOption: backgroundOptionSchema,
  customBackgroundUrl: z.string().url().nullable(),
  provider: providerSchema.nullable(),
  status: generationStatusSchema,
  resultImageUrl: z.string().url().nullable(),
  error: z.string().nullable(),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
});
export type Generation = z.infer<typeof generationSchema>;

export const createGenerationResponseSchema = z.object({
  generation: generationSchema,
  /** Solde après réservation du crédit (hold). */
  creditsRemaining: z.number().int(),
});
export type CreateGenerationResponse = z.infer<typeof createGenerationResponseSchema>;

/** Réponse de GET /generations/:id (polling écran 04). */
export const getGenerationResponseSchema = z.object({
  generation: generationSchema,
});
export type GetGenerationResponse = z.infer<typeof getGenerationResponseSchema>;

// ─────────────────────────────────────────────────────────────────
// Credit packs — GET /credit-packs (miroir des offerings RevenueCat)
// ─────────────────────────────────────────────────────────────────

export const creditPackSchema = z.object({
  id: z.string(),
  credits: z.number().int().positive(),
  priceEur: z.number().positive(),
  popular: z.boolean().optional(),
});
export type CreditPack = z.infer<typeof creditPackSchema>;

export const creditPacksResponseSchema = z.object({
  packs: z.array(creditPackSchema),
});
export type CreditPacksResponse = z.infer<typeof creditPacksResponseSchema>;

/** Réponse de GET /credits (solde + historique, écran 07). */
export const creditsResponseSchema = z.object({
  balance: z.number().int(),
  history: z.array(
    z.object({
      id: z.string().uuid(),
      delta: z.number().int(),
      reason: ledgerReasonSchema,
      ref: z.string().nullable(),
      createdAt: z.string(),
    }),
  ),
});
export type CreditsResponse = z.infer<typeof creditsResponseSchema>;

// ─────────────────────────────────────────────────────────────────
// Me / Shop — GET /me · PATCH /me (écran 08)
// ─────────────────────────────────────────────────────────────────

export const shopSettingsSchema = z.object({
  watermark: z.boolean().default(true),
  defaultRenderType: renderTypeSchema.optional(),
  defaultMannequinOption: mannequinOptionSchema.optional(),
});
export type ShopSettings = z.infer<typeof shopSettingsSchema>;

export const shopSchema = z.object({
  id: z.string().uuid(),
  authId: z.string(),
  name: z.string(),
  city: z.string().nullable(),
  avatarUrl: z.string().url().nullable(),
  settings: shopSettingsSchema,
  createdAt: z.string(),
});
export type Shop = z.infer<typeof shopSchema>;

export const meResponseSchema = z.object({
  shop: shopSchema,
  credits: z.number().int(),
});
export type MeResponse = z.infer<typeof meResponseSchema>;

export const updateMeRequestSchema = z.object({
  name: z.string().min(1).optional(),
  city: z.string().nullable().optional(),
  avatarUrl: z.string().url().nullable().optional(),
  settings: shopSettingsSchema.partial().optional(),
});
export type UpdateMeRequest = z.infer<typeof updateMeRequestSchema>;

// ─────────────────────────────────────────────────────────────────
// Backgrounds — GET /backgrounds · POST /backgrounds (fonds réutilisables)
// ─────────────────────────────────────────────────────────────────

export const backgroundSchema = z.object({
  id: z.string().uuid(),
  shopId: z.string().uuid(),
  imageUrl: z.string().url(),
  name: z.string(),
  createdAt: z.string(),
});
export type Background = z.infer<typeof backgroundSchema>;

export const createBackgroundRequestSchema = z.object({
  imageUrl: z.string().url(),
  name: z.string().min(1),
});
export type CreateBackgroundRequest = z.infer<typeof createBackgroundRequestSchema>;

export const backgroundsResponseSchema = z.object({
  backgrounds: z.array(backgroundSchema),
});
export type BackgroundsResponse = z.infer<typeof backgroundsResponseSchema>;
