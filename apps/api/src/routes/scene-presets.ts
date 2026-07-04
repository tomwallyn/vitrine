import {
  createScenePresetRequestSchema,
  createScenePresetResponseSchema,
  scenePresetsQuerySchema,
  scenePresetsResponseSchema,
  type ScenePreset,
} from '@vitrine/shared';
import { and, desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import { getDb, getTxDb } from '../db/client.js';
import { scenePresets } from '../db/schema.js';
import { upsertShopByAuthId } from '../services/shops.js';

type ScenePresetRow = typeof scenePresets.$inferSelect;

function serialize(row: ScenePresetRow): ScenePreset {
  return {
    id: row.id,
    slot: row.slot,
    text: row.text,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Presets texte perso de « Compléter la scène » (rendu objet), réutilisables :
 * - GET  /scene-presets?slot=surface|background|accessoires : liste du shop pour ce slot.
 * - POST /scene-presets : enregistre { slot, text } (dédupliqué par (shop, slot, text)).
 */
export function registerScenePresetRoutes(app: FastifyInstance): void {
  app.get('/scene-presets', async (req, reply) => {
    const parsed = scenePresetsQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: 'Bad Request', details: parsed.error.flatten().fieldErrors });
    }
    const db = getDb();
    const shop = await upsertShopByAuthId(getTxDb(), req.authUserId);
    const rows = await db
      .select()
      .from(scenePresets)
      .where(and(eq(scenePresets.shopId, shop.id), eq(scenePresets.slot, parsed.data.slot)))
      .orderBy(desc(scenePresets.createdAt));
    return scenePresetsResponseSchema.parse({ presets: rows.map(serialize) });
  });

  app.post('/scene-presets', async (req, reply) => {
    const parsed = createScenePresetRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: 'Bad Request', details: parsed.error.flatten().fieldErrors });
    }

    const db = getDb();
    const shop = await upsertShopByAuthId(getTxDb(), req.authUserId);
    // Dédup (shop, slot, text) : un doublon renvoie le preset existant (200).
    const [inserted] = await db
      .insert(scenePresets)
      .values({ shopId: shop.id, slot: parsed.data.slot, text: parsed.data.text })
      .onConflictDoNothing({
        target: [scenePresets.shopId, scenePresets.slot, scenePresets.text],
      })
      .returning();

    if (inserted) {
      return reply
        .code(201)
        .send(createScenePresetResponseSchema.parse({ preset: serialize(inserted) }));
    }

    const [existing] = await db
      .select()
      .from(scenePresets)
      .where(
        and(
          eq(scenePresets.shopId, shop.id),
          eq(scenePresets.slot, parsed.data.slot),
          eq(scenePresets.text, parsed.data.text),
        ),
      );
    if (!existing) throw new Error('scene_presets introuvable après conflit ON CONFLICT');
    return reply
      .code(200)
      .send(createScenePresetResponseSchema.parse({ preset: serialize(existing) }));
  });
}
