import {
  backgroundsResponseSchema,
  createBackgroundRequestSchema,
  createBackgroundResponseSchema,
  type Background,
} from '@vitrine/shared';
import { desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import { getDb } from '../db/client.js';
import { backgrounds } from '../db/schema.js';
import { upsertShopByAuthId } from '../services/shops.js';

type BackgroundRow = typeof backgrounds.$inferSelect;

/** Ligne Drizzle → contrat `Background` de @vitrine/shared. */
function serializeBackground(row: BackgroundRow): Background {
  return {
    id: row.id,
    shopId: row.shopId,
    imageUrl: row.imageUrl,
    name: row.name,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Fonds personnalisés réutilisables (écran 03 + préréglages) :
 * - GET  /backgrounds : liste des fonds du shop (plus récents d'abord).
 * - POST /backgrounds : enregistre { imageUrl, name } (image déjà uploadée
 *   via POST /uploads/sign kind='background').
 */
export function registerBackgroundRoutes(app: FastifyInstance): void {
  app.get('/backgrounds', async (req) => {
    const db = getDb();
    const shop = await upsertShopByAuthId(db, req.authUserId);
    const rows = await db
      .select()
      .from(backgrounds)
      .where(eq(backgrounds.shopId, shop.id))
      .orderBy(desc(backgrounds.createdAt));
    return backgroundsResponseSchema.parse({ backgrounds: rows.map(serializeBackground) });
  });

  app.post('/backgrounds', async (req, reply) => {
    const parsed = createBackgroundRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: 'Bad Request', details: parsed.error.flatten().fieldErrors });
    }

    const db = getDb();
    const shop = await upsertShopByAuthId(db, req.authUserId);
    const [row] = await db
      .insert(backgrounds)
      .values({ shopId: shop.id, imageUrl: parsed.data.imageUrl, name: parsed.data.name })
      .returning();
    if (!row) throw new Error('INSERT backgrounds sans ligne retournée');

    return reply
      .code(201)
      .send(createBackgroundResponseSchema.parse({ background: serializeBackground(row) }));
  });
}
