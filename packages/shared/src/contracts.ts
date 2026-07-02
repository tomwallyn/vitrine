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
// Uploads — POST /uploads/sign (URL signée GCS, PUT v4 ~10 min)
// ─────────────────────────────────────────────────────────────────

/** Destination de l'upload : photo source du vêtement ou fond personnalisé. */
export const uploadKindSchema = z.enum(['source', 'background']);
export type UploadKind = z.infer<typeof uploadKindSchema>;
export const UPLOAD_KINDS = uploadKindSchema.options;

/** Types MIME image acceptés par l'URL signée (verrouillés dans la signature). */
export const uploadContentTypeSchema = z.enum([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
]);
export type UploadContentType = z.infer<typeof uploadContentTypeSchema>;

export const signUploadRequestSchema = z.object({
  contentType: uploadContentTypeSchema,
  kind: uploadKindSchema.default('source'),
});
export type SignUploadRequest = z.infer<typeof signUploadRequestSchema>;

export const signUploadResponseSchema = z.object({
  /** URL signée (PUT v4, ~10 min) vers laquelle envoyer le binaire. */
  uploadUrl: z.string().url(),
  /** Chemin de l'objet dans le bucket : shops/{authUserId}/{sources|backgrounds}/{uuid}. */
  objectPath: z.string().min(1),
  /** URL publique de lecture (https://storage.googleapis.com/...). */
  publicUrl: z.string().url(),
});
export type SignUploadResponse = z.infer<typeof signUploadResponseSchema>;

// ─────────────────────────────────────────────────────────────────
// Generation — POST /generations · GET /generations/:id
// ─────────────────────────────────────────────────────────────────

export const createGenerationRequestSchema = z
  .object({
    /** URL GCS de la photo source (obtenue via POST /uploads/sign). */
    sourceImageUrl: z.string().url(),
    renderType: renderTypeSchema,
    mannequinOption: mannequinOptionSchema,
    backgroundOption: backgroundOptionSchema.default('studio'),
    /** Requis si backgroundOption === 'custom' (fond uploadé réutilisable). */
    customBackgroundUrl: z.string().url().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.backgroundOption === 'custom' && !data.customBackgroundUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['customBackgroundUrl'],
        message: "customBackgroundUrl est requis quand backgroundOption vaut 'custom'",
      });
    }
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

/**
 * POST /generations/:id/variants — génère la même source sous d'autres types
 * de rendu (écran 05 « Variantes »). 1 crédit réservé PAR type demandé.
 */
export const createVariantsRequestSchema = z.object({
  renderTypes: z.array(renderTypeSchema).min(1).max(4),
});
export type CreateVariantsRequest = z.infer<typeof createVariantsRequestSchema>;

export const createVariantsResponseSchema = z.object({
  generations: z.array(generationSchema),
  /** Solde après réservation des crédits (holds). */
  creditsRemaining: z.number().int(),
});
export type CreateVariantsResponse = z.infer<typeof createVariantsResponseSchema>;

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

/** Pack renvoyé par l'API : pack + prix/visuel calculé (0,90 / 0,68 / 0,55 €). */
export const creditPackOfferSchema = creditPackSchema.extend({
  pricePerCreditEur: z.number().positive(),
});
export type CreditPackOffer = z.infer<typeof creditPackOfferSchema>;

export const creditPacksResponseSchema = z.object({
  packs: z.array(creditPackOfferSchema),
});
export type CreditPacksResponse = z.infer<typeof creditPacksResponseSchema>;

/** Query de GET /credits — pagination offset simple de l'historique. */
export const creditsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});
export type CreditsQuery = z.infer<typeof creditsQuerySchema>;

/** Ligne d'historique du ledger (achat, génération, refund, bonus). */
export const creditsLedgerEntrySchema = z.object({
  id: z.string().uuid(),
  delta: z.number().int(),
  reason: ledgerReasonSchema,
  ref: z.string().nullable(),
  createdAt: z.string(),
});
export type CreditsLedgerEntry = z.infer<typeof creditsLedgerEntrySchema>;

/** Réponse de GET /credits (solde + historique paginé, écran 07). */
export const creditsResponseSchema = z.object({
  balance: z.number().int(),
  history: z.array(creditsLedgerEntrySchema),
  /** true s'il reste des lignes au-delà de offset+limit. */
  hasMore: z.boolean(),
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

/** Réponse de POST /backgrounds (fond enregistré, réutilisable). */
export const createBackgroundResponseSchema = z.object({
  background: backgroundSchema,
});
export type CreateBackgroundResponse = z.infer<typeof createBackgroundResponseSchema>;
