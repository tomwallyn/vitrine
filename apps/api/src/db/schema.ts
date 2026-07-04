import type { RenderType } from '@vitrine/shared';
import {
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

// ── Enums (miroir de @vitrine/shared) ────────────────────────────

export const subjectTypeEnum = pgEnum('subject_type', ['vetement', 'objet']);
export const sceneLightingEnum = pgEnum('scene_lighting', ['douce', 'doree', 'contrastee']);
export const scenePresetSlotEnum = pgEnum('scene_preset_slot', [
  'surface',
  'background',
  'accessoires',
]);
export const renderTypeEnum = pgEnum('render_type', [
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
export const mannequinOptionEnum = pgEnum('mannequin_option', [
  'femme',
  'homme',
  'silhouette',
  'studio',
]);
export const backgroundOptionEnum = pgEnum('background_option', ['studio', 'custom']);
export const garmentTypeEnum = pgEnum('garment_type', ['haut', 'bas', 'robe']);
export const garmentSlotEnum = pgEnum('garment_slot', ['haut', 'bas', 'chaussures']);
export const generationStatusEnum = pgEnum('generation_status', [
  'queued',
  'processing',
  'done',
  'failed',
]);
export const providerEnum = pgEnum('provider', ['fashn', 'kling', 'nanobanana']);
export const ledgerReasonEnum = pgEnum('ledger_reason', [
  'purchase',
  'generation_hold',
  'generation_commit',
  'refund',
  'bonus',
]);
export const purchaseStatusEnum = pgEnum('purchase_status', [
  'pending',
  'completed',
  'failed',
  'refunded',
]);

// ── Tables ───────────────────────────────────────────────────────

/** Boutiques (1 shop = 1 compte Clerk). */
export const shops = pgTable('shops', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** Clerk user id — unique. */
  authId: text('auth_id').notNull().unique(),
  name: text('name').notNull(),
  city: text('city'),
  avatarUrl: text('avatar_url'),
  /** { watermark, defaultRenderType?, defaultMannequinOption?, defaultBackgroundOption? } */
  settings: jsonb('settings')
    .$type<{
      watermark: boolean;
      defaultRenderType?: RenderType;
      defaultMannequinOption?: 'femme' | 'homme' | 'silhouette' | 'studio';
      defaultBackgroundOption?: 'studio' | 'custom';
    }>()
    .notNull()
    .default({ watermark: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Ledger de crédits append-only — source de vérité du solde.
 * Solde = SUM(delta). Débit atomique via SELECT ... FOR UPDATE sur le shop.
 */
export const creditsLedger = pgTable('credits_ledger', {
  id: uuid('id').primaryKey().defaultRandom(),
  shopId: uuid('shop_id')
    .notNull()
    .references(() => shops.id),
  delta: integer('delta').notNull(),
  reason: ledgerReasonEnum('reason').notNull(),
  /** generation_id, rc_transaction_id ou 'signup' (bonus) selon la raison. */
  ref: text('ref'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Achats de packs validés par RevenueCat (idempotents sur rc_transaction_id). */
export const creditPurchases = pgTable('credit_purchases', {
  id: uuid('id').primaryKey().defaultRandom(),
  shopId: uuid('shop_id')
    .notNull()
    .references(() => shops.id),
  rcTransactionId: text('rc_transaction_id').notNull().unique(),
  productId: text('product_id').notNull(),
  credits: integer('credits').notNull(),
  amountCents: integer('amount_cents').notNull(),
  currency: text('currency').notNull().default('EUR'),
  status: purchaseStatusEnum('status').notNull().default('completed'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Générations IA (pipeline async fal.ai, 1 crédit / génération). */
export const generations = pgTable('generations', {
  id: uuid('id').primaryKey().defaultRandom(),
  shopId: uuid('shop_id')
    .notNull()
    .references(() => shops.id),
  sourceImageUrl: text('source_image_url').notNull(),
  /** Nom court auto-généré par IA (titre galerie par défaut + recherche). Null tant que non nommé. */
  name: text('name'),
  /** Type de sujet (vêtement/objet) — v2. */
  subjectType: subjectTypeEnum('subject_type').notNull().default('vetement'),
  renderType: renderTypeEnum('render_type').notNull(),
  modelOption: mannequinOptionEnum('model_option').notNull(),
  /** Variante de mannequin choisie dans la catégorie (id catalogue, ex. 'femme-2'). */
  mannequinId: text('mannequin_id'),
  backgroundOption: backgroundOptionEnum('background_option').notNull().default('studio'),
  customBackgroundUrl: text('custom_background_url'),
  /**
   * Photos additionnelles du même vêtement (URLs GCS canoniques) —
   * `back`/`detail` alimentent le rendu Nano Banana, `label` (étiquette)
   * est stockée pour l'OCR à venir (jamais utilisée pour le rendu).
   */
  extraImages: jsonb('extra_images').$type<{ back?: string; detail?: string; label?: string }>(),
  /**
   * « Compléter la tenue » (rendu « sur modèle ») — type générique de la pièce
   * importée et pièces de complétion (URLs canoniques GCS/CDN) portées EN PLUS
   * du vêtement source. Null hors rendu model / sans complétion.
   */
  garmentType: garmentTypeEnum('garment_type'),
  outfit: jsonb('outfit').$type<{ top?: string; bottom?: string; shoes?: string }>(),
  /** OBJET (v2) : ambiance lumière + scène (surface/décor/accessoires + décor perso). */
  lighting: sceneLightingEnum('lighting'),
  scene: jsonb('scene').$type<{
    surface?: string;
    background?: string;
    accessoires?: string;
    decorUrl?: string;
  }>(),
  /**
   * Fiche produit extraite par OCR de l'étiquette/détail via un modèle vision
   * fal (openrouter/router/vision) — miroir de `productInfoSchema` de
   * @vitrine/shared. Null tant que rien n'a été extrait : l'OCR est
   * best-effort, un rendu peut être `done` avec product_info null.
   */
  productInfo: jsonb('product_info').$type<{
    matiere?: string;
    taille?: string;
    couleur?: string;
    composition?: string;
    entretien?: string;
    description: string;
  }>(),
  provider: providerEnum('provider'),
  providerRequestId: text('provider_request_id'),
  status: generationStatusEnum('status').notNull().default('queued'),
  resultImageUrl: text('result_image_url'),
  error: text('error'),
  /** Ligne de ledger du hold (réservation du crédit), pour commit/refund. */
  holdLedgerId: uuid('hold_ledger_id').references(() => creditsLedger.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});

/**
 * Presets texte perso de « Compléter la scène » (rendu objet) : descriptions
 * libres saisies par l'utilisateur (surface / arrière-plan / accessoires),
 * réutilisables. `text` unique par (shop, slot) — pas de doublon.
 */
export const scenePresets = pgTable(
  'scene_presets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    shopId: uuid('shop_id')
      .notNull()
      .references(() => shops.id),
    slot: scenePresetSlotEnum('slot').notNull(),
    text: text('text').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('scene_presets_shop_slot_text_unique').on(t.shopId, t.slot, t.text)],
);

/** Fonds personnalisés uploadés, réutilisables (écran 03 + préréglages). */
export const backgrounds = pgTable('backgrounds', {
  id: uuid('id').primaryKey().defaultRandom(),
  shopId: uuid('shop_id')
    .notNull()
    .references(() => shops.id),
  imageUrl: text('image_url').notNull(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Garde-robe : pièces de vêtement custom uploadées, réutilisables pour
 * « Compléter la tenue » (rendu « sur modèle »). `slot` = bas/haut/chaussures.
 */
export const garmentItems = pgTable('garment_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  shopId: uuid('shop_id')
    .notNull()
    .references(() => shops.id),
  slot: garmentSlotEnum('slot').notNull(),
  imageUrl: text('image_url').notNull(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Tokens push Expo (`ExponentPushToken[...]`) — un shop peut avoir plusieurs
 * appareils (1 ligne par appareil). `token` unique : un appareil qui change de
 * compte est ré-attaché au dernier shop connecté (upsert ON CONFLICT (token)).
 * Les tokens invalides (DeviceNotRegistered) sont purgés à l'envoi.
 */
export const pushTokens = pgTable('push_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  shopId: uuid('shop_id')
    .notNull()
    .references(() => shops.id),
  token: text('token').notNull().unique(),
  /** 'ios' | 'android' (miroir de pushPlatformSchema de @vitrine/shared). */
  platform: text('platform').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** « Mes créations » (écran 06) — titre + tags pour filtres. */
export const galleryItems = pgTable(
  'gallery_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    shopId: uuid('shop_id')
      .notNull()
      .references(() => shops.id),
    generationId: uuid('generation_id')
      .notNull()
      .references(() => generations.id),
    title: text('title').notNull(),
    /** ex. ["model"] — filtres Tout / Sur modèle / Cintre. */
    tags: jsonb('tags').$type<string[]>().notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Idempotence de « Ajouter à ma galerie » : 1 item max par génération.
    unique('gallery_items_shop_generation_unique').on(t.shopId, t.generationId),
  ],
);
