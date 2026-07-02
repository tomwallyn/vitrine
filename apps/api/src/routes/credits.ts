import {
  CREDIT_PACKS,
  creditPacksResponseSchema,
  creditsQuerySchema,
  creditsResponseSchema,
  packPricePerCredit,
} from '@vitrine/shared';
import { desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import { getDb } from '../db/client.js';
import { creditsLedger } from '../db/schema.js';
import { getBalance } from '../services/credits.js';
import { upsertShopByAuthId } from '../services/shops.js';

/**
 * Crédits (écran 07) :
 * - GET /credits      : solde (SUM du ledger) + historique paginé (?limit&offset).
 * - GET /credit-packs : les 3 packs (constantes @vitrine/shared, miroir des
 *   offerings RevenueCat) avec prix/visuel calculé.
 */
export function registerCreditRoutes(app: FastifyInstance): void {
  app.get('/credits', async (req, reply) => {
    const query = creditsQuerySchema.safeParse(req.query ?? {});
    if (!query.success) {
      return reply
        .code(400)
        .send({ error: 'Bad Request', details: query.error.flatten().fieldErrors });
    }
    const { limit, offset } = query.data;

    const db = getDb();
    const shop = await upsertShopByAuthId(db, req.authUserId);
    const balance = await getBalance(db, shop.id);

    // limit + 1 : la ligne excédentaire signale qu'il reste une page (hasMore).
    const rows = await db
      .select()
      .from(creditsLedger)
      .where(eq(creditsLedger.shopId, shop.id))
      .orderBy(desc(creditsLedger.createdAt), desc(creditsLedger.id))
      .limit(limit + 1)
      .offset(offset);

    return creditsResponseSchema.parse({
      balance,
      history: rows.slice(0, limit).map((row) => ({
        id: row.id,
        delta: row.delta,
        reason: row.reason,
        ref: row.ref,
        createdAt: row.createdAt.toISOString(),
      })),
      hasMore: rows.length > limit,
    });
  });

  app.get('/credit-packs', async () =>
    creditPacksResponseSchema.parse({
      packs: CREDIT_PACKS.map((pack) => ({
        ...pack,
        pricePerCreditEur: packPricePerCredit(pack),
      })),
    }),
  );
}
