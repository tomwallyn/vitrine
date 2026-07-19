import {
  meResponseSchema,
  registerPushTokenRequestSchema,
  registerPushTokenResponseSchema,
  shopSettingsSchema,
  updateMeRequestSchema,
  type MeResponse,
} from '@vitrine/shared';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import { getDb, getTxDb, type Db } from '../db/client.js';
import { pushTokens, shops } from '../db/schema.js';
import { getBalance } from '../services/credits.js';
import { countDoneGenerations, countDoneGenerationsThisMonth } from '../services/generations.js';
import { serializeShop, upsertShopByAuthId, type ShopRow } from '../services/shops.js';

/**
 * Shop → MeResponse : solde (SUM du ledger) + stats (visuels total + ce mois,
 * = générations `done`).
 */
async function buildMeResponse(db: Db, shop: ShopRow): Promise<MeResponse> {
  const [credits, visualsCount, visualsThisMonth] = await Promise.all([
    getBalance(db, shop.id),
    countDoneGenerations(db, shop.id),
    countDoneGenerationsThisMonth(db, shop.id),
  ]);
  return meResponseSchema.parse({
    shop: serializeShop(shop),
    credits,
    stats: { visualsCount, visualsThisMonth },
  });
}

/**
 * Profil / boutique (écran 08) :
 * - GET  /me : shop courant (créé à la première connexion) + solde + stats.
 * - PATCH /me : met à jour name / city / avatarUrl / settings (merge partiel).
 * - POST /me/push-token : enregistre le token push Expo de l'appareil courant
 *   (notifications de fin de génération, cf. services/push.ts).
 */
export function registerMeRoutes(app: FastifyInstance): void {
  app.get('/me', async (req): Promise<MeResponse> => {
    const db = getDb();
    // Upsert transactionnel (driver WebSocket) : bonus de bienvenue atomique à l'INSERT.
    const shop = await upsertShopByAuthId(getTxDb(), req.authUserId);
    return buildMeResponse(db, shop);
  });

  app.patch('/me', async (req, reply): Promise<MeResponse | void> => {
    const parsed = updateMeRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: 'Bad Request', details: parsed.error.flatten().fieldErrors });
    }

    const db = getDb();
    const shop = await upsertShopByAuthId(getTxDb(), req.authUserId);

    const data = parsed.data;
    const patch: Partial<typeof shops.$inferInsert> = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.city !== undefined) patch.city = data.city;
    if (data.avatarUrl !== undefined) patch.avatarUrl = data.avatarUrl;
    if (data.settings !== undefined) {
      // Merge partiel sur les settings existants, revalidé par le contrat partagé.
      patch.settings = shopSettingsSchema.parse({ ...shop.settings, ...data.settings });
    }

    let updated = shop;
    if (Object.keys(patch).length > 0) {
      const [row] = await db.update(shops).set(patch).where(eq(shops.id, shop.id)).returning();
      if (row) updated = row;
    }

    return buildMeResponse(db, updated);
  });

  app.post('/me/push-token', async (req, reply) => {
    const parsed = registerPushTokenRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: 'Bad Request', details: parsed.error.flatten().fieldErrors });
    }

    const db = getDb();
    const shop = await upsertShopByAuthId(getTxDb(), req.authUserId);

    // Upsert par token : ré-enregistrer est idempotent, et un appareil qui
    // change de compte est ré-attaché au shop courant (jamais de doublon).
    const { token, platform } = parsed.data;
    await db
      .insert(pushTokens)
      .values({ shopId: shop.id, token, platform })
      .onConflictDoUpdate({
        target: pushTokens.token,
        set: { shopId: shop.id, platform },
      });

    return registerPushTokenResponseSchema.parse({ ok: true });
  });
}
