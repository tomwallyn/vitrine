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

export const renderTypeEnum = pgEnum('render_type', ['model', 'hanger', 'folded', 'studio']);
export const mannequinOptionEnum = pgEnum('mannequin_option', [
  'femme',
  'homme',
  'silhouette',
  'studio',
]);
export const backgroundOptionEnum = pgEnum('background_option', ['studio', 'custom']);
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
      defaultRenderType?: 'model' | 'hanger' | 'folded' | 'studio';
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
  renderType: renderTypeEnum('render_type').notNull(),
  modelOption: mannequinOptionEnum('model_option').notNull(),
  backgroundOption: backgroundOptionEnum('background_option').notNull().default('studio'),
  customBackgroundUrl: text('custom_background_url'),
  /**
   * Photos additionnelles du même vêtement (URLs GCS canoniques) —
   * `back`/`detail` alimentent le rendu Nano Banana, `label` (étiquette)
   * est stockée pour l'OCR à venir (jamais utilisée pour le rendu).
   */
  extraImages: jsonb('extra_images').$type<{ back?: string; detail?: string; label?: string }>(),
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
