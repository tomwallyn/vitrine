import { shopSettingsSchema, type Shop } from '@vitrine/shared';

import type { Db } from '../db/client.js';
import { shops } from '../db/schema.js';

export type ShopRow = typeof shops.$inferSelect;

/** Nom par défaut à la création du shop (éditable ensuite via PATCH /me). */
export const DEFAULT_SHOP_NAME = 'Ma boutique';

/**
 * Upsert du shop par `auth_id` (Clerk uid) : créé à la première connexion,
 * retourné tel quel ensuite. L'`ON CONFLICT DO UPDATE` no-op garantit que
 * `RETURNING` renvoie toujours la ligne (contrairement à DO NOTHING).
 */
export async function upsertShopByAuthId(db: Db, authId: string): Promise<ShopRow> {
  const [shop] = await db
    .insert(shops)
    .values({ authId, name: DEFAULT_SHOP_NAME })
    .onConflictDoUpdate({ target: shops.authId, set: { authId } })
    .returning();
  if (!shop) {
    throw new Error(`Upsert du shop impossible pour auth_id=${authId}`);
  }
  return shop;
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
