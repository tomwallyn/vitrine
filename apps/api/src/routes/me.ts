import {
  meResponseSchema,
  shopSettingsSchema,
  updateMeRequestSchema,
  type MeResponse,
} from '@vitrine/shared';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import { getDb } from '../db/client.js';
import { shops } from '../db/schema.js';
import { getBalance } from '../services/credits.js';
import { serializeShop, upsertShopByAuthId } from '../services/shops.js';

/**
 * Profil / boutique (écran 08) :
 * - GET  /me : shop courant (créé à la première connexion) + solde de crédits.
 * - PATCH /me : met à jour name / city / avatarUrl / settings (merge partiel).
 */
export function registerMeRoutes(app: FastifyInstance): void {
  app.get('/me', async (req): Promise<MeResponse> => {
    const db = getDb();
    const shop = await upsertShopByAuthId(db, req.authUserId);
    const credits = await getBalance(db, shop.id);
    return meResponseSchema.parse({ shop: serializeShop(shop), credits });
  });

  app.patch('/me', async (req, reply): Promise<MeResponse | void> => {
    const parsed = updateMeRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: 'Bad Request', details: parsed.error.flatten().fieldErrors });
    }

    const db = getDb();
    const shop = await upsertShopByAuthId(db, req.authUserId);

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

    const credits = await getBalance(db, updated.id);
    return meResponseSchema.parse({ shop: serializeShop(updated), credits });
  });
}
