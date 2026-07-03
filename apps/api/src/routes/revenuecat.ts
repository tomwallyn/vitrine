import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { getDb, getTxDb } from '../db/client.js';
import { getBalance } from '../services/credits.js';
import { applyPurchase, creditsForProduct } from '../services/purchases.js';
import { upsertShopByAuthId } from '../services/shops.js';

/**
 * Événements RevenueCat qui créditent des crédits :
 * - NON_RENEWING_PURCHASE : achat d'un consommable = pack de crédits ;
 * - INITIAL_PURCHASE / RENEWAL / PRODUCT_CHANGE : abonnement (upsell) —
 *   crédite les crédits de la période.
 * Tout le reste (TEST, CANCELLATION, EXPIRATION, BILLING_ISSUE, TRANSFER…)
 * est acquitté en 200 sans effet.
 */
const CREDITING_EVENT_TYPES = new Set([
  'INITIAL_PURCHASE',
  'NON_RENEWING_PURCHASE',
  'RENEWAL',
  'PRODUCT_CHANGE',
]);

/** Event RevenueCat (parse tolérant — seuls les champs utilisés sont typés). */
const rcEventSchema = z
  .object({
    /** Id unique de l'événement (fallback d'idempotence si transaction_id absent). */
    id: z.string(),
    type: z.string(),
    /** appUserID RevenueCat = Clerk uid (Purchases.configure côté mobile). */
    app_user_id: z.string().nullable().optional(),
    original_app_user_id: z.string().nullable().optional(),
    product_id: z.string().nullable().optional(),
    transaction_id: z.string().nullable().optional(),
    price: z.number().nullable().optional(),
    price_in_purchased_currency: z.number().nullable().optional(),
    currency: z.string().nullable().optional(),
  })
  .passthrough();

const rcWebhookBodySchema = z
  .object({
    api_version: z.string().optional(),
    event: rcEventSchema,
  })
  .passthrough();

type RcEvent = z.infer<typeof rcEventSchema>;

/**
 * Clerk uid porté par l'événement : app_user_id, sinon original_app_user_id —
 * en ignorant les ids anonymes RevenueCat ($RCAnonymousID:…), qui ne
 * correspondent à aucun shop.
 */
function pickAppUserId(event: RcEvent): string | null {
  for (const candidate of [event.app_user_id, event.original_app_user_id]) {
    if (candidate && !candidate.startsWith('$RCAnonymousID:')) return candidate;
  }
  return null;
}

/**
 * POST /webhooks/revenuecat — achat validé par RevenueCat → +N crédits.
 *
 * - **Public** (le plugin d'auth Clerk ignore /webhooks/*) mais protégé par
 *   le header `Authorization` : il doit valoir REVENUECAT_WEBHOOK_SECRET
 *   (valeur configurée dans le dashboard RevenueCat, `Bearer <secret>`
 *   accepté) → 401 sinon.
 * - **Idempotent** sur rc_transaction_id (unique en DB) : un webhook rejoué
 *   ne recrédite pas (cf. services/purchases.ts).
 * - Répond 200 pour les événements ignorés (TEST, produit inconnu, id
 *   anonyme…) pour que RevenueCat ne les rejoue pas ; 400 si payload
 *   illisible ; 5xx (erreur DB) → RevenueCat retente.
 */
export function registerRevenueCatWebhookRoutes(app: FastifyInstance): void {
  app.post('/webhooks/revenuecat', async (req, reply) => {
    const secret = process.env.REVENUECAT_WEBHOOK_SECRET;
    if (!secret) {
      req.log.error('REVENUECAT_WEBHOOK_SECRET manquant — webhook RevenueCat refusé');
      return reply.code(500).send({ error: 'Server misconfigured' });
    }
    const authorization = req.headers.authorization;
    if (authorization !== secret && authorization !== `Bearer ${secret}`) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    const parsed = rcWebhookBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: 'Bad Request' });
    const event = parsed.data.event;

    if (!CREDITING_EVENT_TYPES.has(event.type)) {
      return { ok: true, ignored: true, type: event.type };
    }

    const productId = event.product_id ?? null;
    const credits = productId ? creditsForProduct(productId) : null;
    if (!productId || credits === null) {
      req.log.warn(
        { eventId: event.id, type: event.type, productId },
        'Webhook RevenueCat ignoré : product_id inconnu (aucun pack correspondant)',
      );
      return { ok: true, ignored: true, reason: 'unknown_product' };
    }

    const appUserId = pickAppUserId(event);
    if (!appUserId) {
      req.log.warn(
        { eventId: event.id, appUserId: event.app_user_id },
        'Webhook RevenueCat ignoré : app_user_id anonyme (pas de shop associable)',
      );
      return { ok: true, ignored: true, reason: 'anonymous_app_user_id' };
    }

    const db = getDb();
    // app_user_id = Clerk uid : même upsert que les routes authentifiées
    // (le shop existe déjà en pratique — l'app a appelé /me avant d'acheter).
    const shop = await upsertShopByAuthId(getTxDb(), appUserId);

    const { credited } = await applyPurchase(getTxDb(), {
      shopId: shop.id,
      rcTransactionId: event.transaction_id ?? event.id,
      productId,
      credits,
      amountCents: Math.round((event.price_in_purchased_currency ?? event.price ?? 0) * 100),
      currency: event.currency ?? 'EUR',
    });

    const balance = await getBalance(db, shop.id);
    req.log.info(
      { eventId: event.id, type: event.type, productId, credits, credited, balance },
      credited
        ? 'Achat RevenueCat crédité'
        : 'Webhook RevenueCat rejoué — déjà crédité (idempotent)',
    );
    return { ok: true, credited, credits: credited ? credits : 0, balance };
  });
}
