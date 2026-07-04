import {
  createGarmentRequestSchema,
  createGarmentResponseSchema,
  garmentsQuerySchema,
  garmentsResponseSchema,
  type GarmentItem,
} from '@vitrine/shared';
import { and, desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import { getDb, getTxDb } from '../db/client.js';
import { garmentItems } from '../db/schema.js';
import { upsertShopByAuthId } from '../services/shops.js';
import { trySignedReadUrl } from '../services/storage.js';

type GarmentRow = typeof garmentItems.$inferSelect;

/**
 * Ligne Drizzle → contrat `GarmentItem`. `imageUrl` reste l'URL canonique
 * (privée, pour le choix/l'envoi), `displayUrl` est une URL signée GET pour
 * afficher la vignette dans l'app (le bucket est privé).
 */
async function serializeGarment(row: GarmentRow): Promise<GarmentItem> {
  return {
    id: row.id,
    shopId: row.shopId,
    slot: row.slot,
    imageUrl: row.imageUrl,
    displayUrl: await trySignedReadUrl(row.imageUrl),
    name: row.name,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Garde-robe : pièces custom réutilisables pour « Compléter la tenue » :
 * - GET  /garments[?slot=bas|haut|chaussures] : liste des pièces du shop
 *   (filtrées par slot si fourni, plus récentes d'abord).
 * - POST /garments : enregistre { imageUrl, slot, name } (image déjà uploadée
 *   via POST /uploads/sign kind='garment').
 */
export function registerGarmentRoutes(app: FastifyInstance): void {
  app.get('/garments', async (req) => {
    const query = garmentsQuerySchema.parse(req.query ?? {});
    const db = getDb();
    const shop = await upsertShopByAuthId(getTxDb(), req.authUserId);
    const rows = await db
      .select()
      .from(garmentItems)
      .where(
        query.slot
          ? and(eq(garmentItems.shopId, shop.id), eq(garmentItems.slot, query.slot))
          : eq(garmentItems.shopId, shop.id),
      )
      .orderBy(desc(garmentItems.createdAt));
    return garmentsResponseSchema.parse({
      garments: await Promise.all(rows.map(serializeGarment)),
    });
  });

  app.post('/garments', async (req, reply) => {
    const parsed = createGarmentRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: 'Bad Request', details: parsed.error.flatten().fieldErrors });
    }

    const db = getDb();
    const shop = await upsertShopByAuthId(getTxDb(), req.authUserId);
    const [row] = await db
      .insert(garmentItems)
      .values({
        shopId: shop.id,
        slot: parsed.data.slot,
        imageUrl: parsed.data.imageUrl,
        name: parsed.data.name,
      })
      .returning();
    if (!row) throw new Error('INSERT garment_items sans ligne retournée');

    return reply
      .code(201)
      .send(createGarmentResponseSchema.parse({ garment: await serializeGarment(row) }));
  });
}
