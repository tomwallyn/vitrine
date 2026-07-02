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
  /** Chemin de l'objet dans le bucket : {sources|backgrounds}/{authUserId}/{uuid}. */
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
// Gallery — GET /gallery · POST /gallery (écran 06 « Mes créations »)
// ─────────────────────────────────────────────────────────────────

/** Filtre de la galerie : Tout / Sur modèle / Cintre (chips écran 06). */
export const galleryFilterSchema = z.enum(['all', 'model', 'hanger']);
export type GalleryFilter = z.infer<typeof galleryFilterSchema>;
export const GALLERY_FILTERS = galleryFilterSchema.options;

/** Ordre de tri (bouton ⇅ de l'écran 06). */
export const gallerySortSchema = z.enum(['recent', 'oldest']);
export type GallerySort = z.infer<typeof gallerySortSchema>;

/** Query de GET /gallery — filtre + tri + pagination offset. */
export const galleryQuerySchema = z.object({
  filter: galleryFilterSchema.default('all'),
  sort: gallerySortSchema.default('recent'),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  offset: z.coerce.number().int().min(0).default(0),
});
export type GalleryQuery = z.infer<typeof galleryQuerySchema>;

/** Item de galerie joint à sa génération (vignette : rendu + type). */
export const galleryItemSchema = z.object({
  id: z.string().uuid(),
  shopId: z.string().uuid(),
  generationId: z.string().uuid(),
  title: z.string(),
  tags: z.array(z.string()),
  renderType: renderTypeSchema,
  resultImageUrl: z.string().url().nullable(),
  createdAt: z.string(),
});
export type GalleryItem = z.infer<typeof galleryItemSchema>;

/** Réponse de GET /gallery (items paginés + compteur « N visuels générés »). */
export const galleryResponseSchema = z.object({
  items: z.array(galleryItemSchema),
  /** Nombre total d'items pour le filtre courant (compteur de l'écran 06). */
  total: z.number().int().min(0),
  /** true s'il reste des items au-delà de offset+limit. */
  hasMore: z.boolean(),
});
export type GalleryResponse = z.infer<typeof galleryResponseSchema>;

/** Body de POST /gallery — « Ajouter à ma galerie » (écran 05). */
export const addToGalleryRequestSchema = z.object({
  generationId: z.string().uuid(),
  /** Titre de la vignette (« Veste coach ») — défaut dérivé côté API. */
  title: z.string().trim().min(1).max(80).optional(),
  tags: z.array(z.string().trim().min(1).max(32)).max(10).optional(),
});
export type AddToGalleryRequest = z.infer<typeof addToGalleryRequestSchema>;

/**
 * Réponse de POST /gallery — 201 si créé, 200 si la génération était déjà
 * dans la galerie (idempotent sur (shop_id, generation_id)).
 */
export const addToGalleryResponseSchema = z.object({
  item: galleryItemSchema,
  /** false si l'item existait déjà (aucun doublon créé). */
  created: z.boolean(),
});
export type AddToGalleryResponse = z.infer<typeof addToGalleryResponseSchema>;

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

/**
 * Réglages de la boutique (jsonb `shops.settings`) — tous optionnels sauf le
 * filigrane : les champs `default*` forment le « préréglage de rendu » appliqué
 * comme défaut à l'écran 03 (édité par l'écran Préréglages, M6). Les settings
 * existants sans ces champs restent valides (rétrocompatible).
 */
export const shopSettingsSchema = z.object({
  watermark: z.boolean().default(true),
  defaultRenderType: renderTypeSchema.optional(),
  defaultMannequinOption: mannequinOptionSchema.optional(),
  defaultBackgroundOption: backgroundOptionSchema.optional(),
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

/** Stats du profil (écran 08) : visuels générés + temps gagné estimé. */
export const meStatsSchema = z.object({
  /** Nombre de générations `done` du shop (= visuels réellement produits). */
  visualsCount: z.number().int().min(0),
  /** visualsCount × MINUTES_SAVED_PER_VISUAL (voir constants.ts). */
  timeSavedMinutes: z.number().int().min(0),
});
export type MeStats = z.infer<typeof meStatsSchema>;

export const meResponseSchema = z.object({
  shop: shopSchema,
  credits: z.number().int(),
  stats: meStatsSchema,
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
