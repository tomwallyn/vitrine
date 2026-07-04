import { z } from 'zod';
import {
  backgroundOptionSchema,
  garmentSlotSchema,
  garmentTypeSchema,
  generationStatusSchema,
  ledgerReasonSchema,
  mannequinOptionSchema,
  providerSchema,
  renderTypeSchema,
} from './enums.js';

// ─────────────────────────────────────────────────────────────────
// Uploads — POST /uploads/sign (URL signée GCS, PUT v4 ~10 min)
// ─────────────────────────────────────────────────────────────────

/** Destination de l'upload : photo source, fond personnalisé, ou pièce de tenue. */
export const uploadKindSchema = z.enum(['source', 'background', 'garment']);
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
  /** Chemin de l'objet dans le bucket : {sources|backgrounds|garments}/{authUserId}/{uuid}. */
  objectPath: z.string().min(1),
  /** URL publique de lecture (https://storage.googleapis.com/...). */
  publicUrl: z.string().url(),
});
export type SignUploadResponse = z.infer<typeof signUploadResponseSchema>;

// ─────────────────────────────────────────────────────────────────
// Generation — POST /generations · GET /generations/:id
// ─────────────────────────────────────────────────────────────────

/**
 * Photos additionnelles du MÊME vêtement (multi-détails) — toutes optionnelles,
 * URLs GCS canoniques (obtenues via POST /uploads/sign) :
 * - `back` / `detail` alimentent le rendu Nano Banana (vues combinées pour
 *   plus de fidélité) — ignorées par les try-on FASHN/Kling (1 image vêtement) ;
 * - `label` (étiquette) est UNIQUEMENT stockée (OCR à venir), jamais rendue.
 */
export const generationExtraImagesSchema = z.object({
  /** Vue arrière du vêtement. */
  back: z.string().url().optional(),
  /** Détail matière / texture. */
  detail: z.string().url().optional(),
  /** Photo de l'étiquette (composition/taille) — stockée pour l'OCR, hors rendu. */
  label: z.string().url().optional(),
});
export type GenerationExtraImages = z.infer<typeof generationExtraImagesSchema>;

/**
 * Pièces complétant la tenue du mannequin (rendu « sur modèle ») — toutes
 * optionnelles, URLs canoniques (GCS pour les pièces custom, CDN pour les
 * suggestions par défaut). Le mannequin les porte EN PLUS du vêtement source ;
 * ignorées hors `renderType === 'model'` et par les try-on FASHN/Kling.
 */
export const generationOutfitSchema = z.object({
  /** Haut à faire porter (quand la pièce importée est un bas). */
  top: z.string().url().optional(),
  /** Bas à faire porter (quand la pièce importée est un haut). */
  bottom: z.string().url().optional(),
  /** Chaussures (optionnel dans tous les cas). */
  shoes: z.string().url().optional(),
});
export type GenerationOutfit = z.infer<typeof generationOutfitSchema>;

/**
 * Fiche produit extraite par OCR (modèle vision sur fal) depuis la photo
 * d'étiquette (`extraImages.label`) et/ou de détail matière (`extraImages.detail`).
 * Tous les champs sont optionnels sauf `description` : le modèle ne remplit
 * que ce qu'il lit réellement sur les images (rien n'est inventé).
 */
export const productInfoSchema = z.object({
  /** Matière principale (ex. « coton », « laine mérinos »). */
  matiere: z.string().optional(),
  /** Taille lisible sur l'étiquette (ex. « M », « 42 »). */
  taille: z.string().optional(),
  /** Couleur dominante du vêtement. */
  couleur: z.string().optional(),
  /** Composition détaillée (ex. « 80 % coton, 20 % polyester »). */
  composition: z.string().optional(),
  /** Consignes d'entretien (ex. « lavage 30 °C, pas de sèche-linge »). */
  entretien: z.string().optional(),
  /** Courte description produit en français (1-2 phrases, ton e-commerce). */
  description: z.string(),
});
export type ProductInfo = z.infer<typeof productInfoSchema>;

export const createGenerationRequestSchema = z
  .object({
    /** URL GCS de la photo source (obtenue via POST /uploads/sign). */
    sourceImageUrl: z.string().url(),
    renderType: renderTypeSchema,
    mannequinOption: mannequinOptionSchema,
    backgroundOption: backgroundOptionSchema.default('studio'),
    /** Requis si backgroundOption === 'custom' (fond uploadé réutilisable). */
    customBackgroundUrl: z.string().url().optional(),
    /** Vues additionnelles du même vêtement (rétrocompat : absent = 1 photo). */
    extraImages: generationExtraImagesSchema.optional(),
    /** Type générique de la pièce importée (« sur modèle » uniquement). */
    garmentType: garmentTypeSchema.optional(),
    /** Pièces complétant la tenue du mannequin (« sur modèle » uniquement). */
    outfit: generationOutfitSchema.optional(),
  })
  .superRefine((data, ctx) => {
    if (data.backgroundOption === 'custom' && !data.customBackgroundUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['customBackgroundUrl'],
        message: "customBackgroundUrl est requis quand backgroundOption vaut 'custom'",
      });
    }
    const hasOutfit = data.outfit && Object.values(data.outfit).some(Boolean);
    if ((hasOutfit || data.garmentType) && data.renderType !== 'model') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['outfit'],
        message: "garmentType/outfit ne s'appliquent qu'au rendu 'model'",
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
  /** Fiche produit OCR (étiquette/détail) — absente/null tant que non extraite. */
  productInfo: productInfoSchema.nullable().optional(),
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
// Batch — POST /generations/batch (lot avec un style commun)
// ─────────────────────────────────────────────────────────────────

/** Taille maximale d'un lot (1 crédit / item, pré-check du solde global). */
export const MAX_BATCH_ITEMS = 30;

/** Item d'un lot : une photo source par vêtement (pas d'extraImages en batch). */
export const batchGenerationItemSchema = z.object({
  /** URL GCS de la photo source (obtenue via POST /uploads/sign). */
  sourceImageUrl: z.string().url(),
});
export type BatchGenerationItem = z.infer<typeof batchGenerationItemSchema>;

/**
 * Body de POST /generations/batch — un **style commun** (rendu, mannequin,
 * fond) appliqué à tous les items du lot.
 */
export const createBatchRequestSchema = z
  .object({
    items: z.array(batchGenerationItemSchema).min(1).max(MAX_BATCH_ITEMS),
    renderType: renderTypeSchema,
    mannequinOption: mannequinOptionSchema,
    backgroundOption: backgroundOptionSchema.default('studio'),
    /** Requis si backgroundOption === 'custom' (fond uploadé réutilisable). */
    customBackgroundUrl: z.string().url().optional(),
    /** Type générique des pièces du lot (« sur modèle » uniquement, commun au lot). */
    garmentType: garmentTypeSchema.optional(),
    /** Tenue commune appliquée à tout le lot (« sur modèle » uniquement). */
    outfit: generationOutfitSchema.optional(),
  })
  .superRefine((data, ctx) => {
    if (data.backgroundOption === 'custom' && !data.customBackgroundUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['customBackgroundUrl'],
        message: "customBackgroundUrl est requis quand backgroundOption vaut 'custom'",
      });
    }
    const hasOutfit = data.outfit && Object.values(data.outfit).some(Boolean);
    if ((hasOutfit || data.garmentType) && data.renderType !== 'model') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['outfit'],
        message: "garmentType/outfit ne s'appliquent qu'au rendu 'model'",
      });
    }
  });
export type CreateBatchRequest = z.infer<typeof createBatchRequestSchema>;

/**
 * Réponse de POST /generations/batch : id + statut de chaque génération créée
 * (`failed` si la soumission fal de CET item a échoué — crédit remboursé).
 */
export const createBatchResponseSchema = z.object({
  generations: z.array(
    z.object({
      id: z.string().uuid(),
      status: generationStatusSchema,
    }),
  ),
});
export type CreateBatchResponse = z.infer<typeof createBatchResponseSchema>;

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
// Push — POST /me/push-token (notifications Expo de fin de génération)
// ─────────────────────────────────────────────────────────────────

/** Plateforme de l'appareil enregistrant le token Expo. */
export const pushPlatformSchema = z.enum(['ios', 'android']);
export type PushPlatform = z.infer<typeof pushPlatformSchema>;

/**
 * Body de POST /me/push-token — enregistre le token push Expo de l'appareil
 * courant (`ExponentPushToken[...]`). Upsert : un token qui change de compte
 * suit le dernier shop connecté sur l'appareil.
 */
export const registerPushTokenRequestSchema = z.object({
  /** Token push Expo de l'appareil (Notifications.getExpoPushTokenAsync). */
  token: z.string().trim().min(1).max(200),
  platform: pushPlatformSchema,
});
export type RegisterPushTokenRequest = z.infer<typeof registerPushTokenRequestSchema>;

export const registerPushTokenResponseSchema = z.object({
  ok: z.literal(true),
});
export type RegisterPushTokenResponse = z.infer<typeof registerPushTokenResponseSchema>;

// ─────────────────────────────────────────────────────────────────
// Backgrounds — GET /backgrounds · POST /backgrounds (fonds réutilisables)
// ─────────────────────────────────────────────────────────────────

export const backgroundSchema = z.object({
  id: z.string().uuid(),
  shopId: z.string().uuid(),
  /** URL GCS canonique (privée) — sert au choix/à l'envoi de la génération. */
  imageUrl: z.string().url(),
  /** URL signée GET (courte durée) — pour afficher la vignette dans l'app. */
  displayUrl: z.string().url(),
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

// ─────────────────────────────────────────────────────────────────
// Garde-robe — GET /garments · POST /garments (pièces custom réutilisables)
// ─────────────────────────────────────────────────────────────────

/** Pièce de garde-robe enregistrée par la boutique (bas/haut/chaussures custom). */
export const garmentItemSchema = z.object({
  id: z.string().uuid(),
  shopId: z.string().uuid(),
  /** Slot de la pièce (filtre les suggestions de l'écran « Choisir une pièce »). */
  slot: garmentSlotSchema,
  /** URL GCS canonique (privée) — sert au choix/à l'envoi de la génération. */
  imageUrl: z.string().url(),
  /** URL signée GET (courte durée) — pour afficher la vignette dans l'app. */
  displayUrl: z.string().url(),
  name: z.string(),
  createdAt: z.string(),
});
export type GarmentItem = z.infer<typeof garmentItemSchema>;

export const createGarmentRequestSchema = z.object({
  imageUrl: z.string().url(),
  slot: garmentSlotSchema,
  name: z.string().min(1),
});
export type CreateGarmentRequest = z.infer<typeof createGarmentRequestSchema>;

/** Query de GET /garments — filtre optionnel par slot. */
export const garmentsQuerySchema = z.object({
  slot: garmentSlotSchema.optional(),
});
export type GarmentsQuery = z.infer<typeof garmentsQuerySchema>;

export const garmentsResponseSchema = z.object({
  garments: z.array(garmentItemSchema),
});
export type GarmentsResponse = z.infer<typeof garmentsResponseSchema>;

/** Réponse de POST /garments (pièce enregistrée, réutilisable). */
export const createGarmentResponseSchema = z.object({
  garment: garmentItemSchema,
});
export type CreateGarmentResponse = z.infer<typeof createGarmentResponseSchema>;
