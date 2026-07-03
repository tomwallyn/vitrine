import { SIGNUP_BONUS_CREDITS, shopSettingsSchema, type Shop } from '@vitrine/shared';
import { getTableColumns, sql } from 'drizzle-orm';

import type { TxDb } from '../db/client.js';
import { creditsLedger, shops } from '../db/schema.js';

export type ShopRow = typeof shops.$inferSelect;

/** Nom par défaut à la création du shop (éditable ensuite via PATCH /me). */
export const DEFAULT_SHOP_NAME = 'Ma boutique';

/**
 * Upsert du shop par `auth_id` (Clerk uid) : créé à la première connexion,
 * retourné tel quel ensuite. L'`ON CONFLICT DO UPDATE` no-op garantit que
 * `RETURNING` renvoie toujours la ligne (contrairement à DO NOTHING).
 *
 * Bonus de bienvenue : `RETURNING (xmax = 0) AS inserted` distingue un vrai
 * INSERT (xmax = 0) d'un UPDATE de conflit (xmax ≠ 0). Si — et seulement si —
 * la ligne vient d'être insérée, une ligne de ledger `bonus`
 * (+SIGNUP_BONUS_CREDITS) est créée dans la MÊME transaction (driver
 * WebSocket, cf. getTxDb) : le shop et son bonus sont atomiques, et rejouer
 * l'upsert (chaque GET /me) ne re-crédite jamais — idempotent par design.
 */
export async function upsertShopByAuthId(txDb: TxDb, authId: string): Promise<ShopRow> {
  return txDb.transaction(async (tx) => {
    const [row] = await tx
      .insert(shops)
      .values({ authId, name: DEFAULT_SHOP_NAME })
      .onConflictDoUpdate({ target: shops.authId, set: { authId } })
      .returning({
        ...getTableColumns(shops),
        // Astuce Postgres : xmax = 0 ⇔ la ligne vient d'être insérée.
        inserted: sql<boolean>`(xmax = 0)`,
      });
    if (!row) {
      throw new Error(`Upsert du shop impossible pour auth_id=${authId}`);
    }

    const { inserted, ...shop } = row;
    if (inserted) {
      await tx.insert(creditsLedger).values({
        shopId: shop.id,
        delta: SIGNUP_BONUS_CREDITS,
        reason: 'bonus',
        ref: 'signup',
      });
    }
    return shop;
  });
}

/** Ligne Drizzle → contrat `Shop` de @vitrine/shared (dates ISO, settings normalisés). */
export function serializeShop(shop: ShopRow): Shop {
  return {
    id: shop.id,
    authId: shop.authId,
    name: shop.name,
    city: shop.city,
    avatarUrl: shop.avatarUrl,
    settings: shopSettingsSchema.parse(shop.settings ?? {}),
    createdAt: shop.createdAt.toISOString(),
  };
}
