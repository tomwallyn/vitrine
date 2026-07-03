import {
  addToGalleryRequestSchema,
  addToGalleryResponseSchema,
  galleryQuerySchema,
  galleryResponseSchema,
  RENDER_TYPE_LABELS,
  type GalleryItem,
  type RenderType,
} from '@vitrine/shared';
import { and, asc, count, desc, eq, type SQL } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import { getDb, getTxDb } from '../db/client.js';
import { galleryItems, generations } from '../db/schema.js';
import { findOwnedGeneration } from '../services/generations.js';
import { upsertShopByAuthId } from '../services/shops.js';
import { trySignedReadUrl } from '../services/storage.js';

type GalleryItemRow = typeof galleryItems.$inferSelect;

/**
 * Ligne gallery_items + colonnes de la génération jointe → contrat `GalleryItem`.
 * Bucket privé : la vignette `resultImageUrl` est renvoyée **signée GET**
 * (repli : URL brute si la signature échoue).
 */
async function serializeGalleryItem(
  row: GalleryItemRow,
  generation: { renderType: RenderType; resultImageUrl: string | null },
): Promise<GalleryItem> {
  return {
    id: row.id,
    shopId: row.shopId,
    generationId: row.generationId,
    title: row.title,
    tags: row.tags,
    renderType: generation.renderType,
    resultImageUrl: generation.resultImageUrl
      ? await trySignedReadUrl(generation.resultImageUrl)
      : null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Titre par défaut : type de rendu + date (« Sur modèle · 02/07/2026 »). */
function defaultTitle(renderType: RenderType, when: Date): string {
  return `${RENDER_TYPE_LABELS[renderType]} · ${when.toLocaleDateString('fr-FR')}`;
}

/**
 * Galerie « Mes créations » (écran 06) :
 * - GET  /gallery?filter=all|model|hanger : items du shop joints à leur
 *   génération (vignette = result_image_url + render_type), paginés, filtrés
 *   par type de rendu, triés par date (⇅ recent|oldest).
 * - POST /gallery : « Ajouter à ma galerie » (écran 05). Vérifie que la
 *   génération appartient au shop et est `done` ; idempotent grâce à la
 *   contrainte unique (shop_id, generation_id) → jamais de doublon.
 */
export function registerGalleryRoutes(app: FastifyInstance): void {
  app.get('/gallery', async (req, reply) => {
    const parsed = galleryQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: 'Bad Request', details: parsed.error.flatten().fieldErrors });
    }
    const { filter, sort, limit, offset } = parsed.data;

    const db = getDb();
    const shop = await upsertShopByAuthId(getTxDb(), req.authUserId);

    const conditions: SQL[] = [eq(galleryItems.shopId, shop.id)];
    if (filter !== 'all') conditions.push(eq(generations.renderType, filter));
    const where = and(...conditions);
    const orderBy =
      sort === 'oldest' ? asc(galleryItems.createdAt) : desc(galleryItems.createdAt);

    // limit+1 pour calculer hasMore sans seconde requête de comptage paginée.
    const rows = await db
      .select({
        item: galleryItems,
        renderType: generations.renderType,
        resultImageUrl: generations.resultImageUrl,
      })
      .from(galleryItems)
      .innerJoin(generations, eq(galleryItems.generationId, generations.id))
      .where(where)
      .orderBy(orderBy, desc(galleryItems.id))
      .limit(limit + 1)
      .offset(offset);

    // Compteur « N visuels générés » (total du filtre courant).
    const [totalRow] = await db
      .select({ total: count() })
      .from(galleryItems)
      .innerJoin(generations, eq(galleryItems.generationId, generations.id))
      .where(where);

    const page = rows.slice(0, limit);
    return galleryResponseSchema.parse({
      items: await Promise.all(
        page.map((r) =>
          serializeGalleryItem(r.item, {
            renderType: r.renderType,
            resultImageUrl: r.resultImageUrl,
          }),
        ),
      ),
      total: totalRow?.total ?? page.length,
      hasMore: rows.length > limit,
    });
  });

  app.post('/gallery', async (req, reply) => {
    const parsed = addToGalleryRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: 'Bad Request', details: parsed.error.flatten().fieldErrors });
    }

    const db = getDb();
    const shop = await upsertShopByAuthId(getTxDb(), req.authUserId);

    // La génération doit appartenir au shop courant…
    const generation = await findOwnedGeneration(db, shop.id, parsed.data.generationId);
    if (!generation) return reply.code(404).send({ error: 'Not Found' });
    // …et être terminée (un rendu existe).
    if (generation.status !== 'done') {
      return reply
        .code(409)
        .send({ error: 'Generation not done', status: generation.status });
    }

    const [inserted] = await db
      .insert(galleryItems)
      .values({
        shopId: shop.id,
        generationId: generation.id,
        title: parsed.data.title ?? defaultTitle(generation.renderType, new Date()),
        // Tag par défaut = type de rendu (aligné sur les filtres de l'écran 06).
        tags: parsed.data.tags ?? [generation.renderType],
      })
      // Idempotent-ish : la même génération n'est jamais dupliquée.
      .onConflictDoNothing({ target: [galleryItems.shopId, galleryItems.generationId] })
      .returning();

    let row = inserted;
    const created = !!inserted;
    if (!row) {
      // Conflit → l'item existe déjà : on le renvoie tel quel (200).
      const [existing] = await db
        .select()
        .from(galleryItems)
        .where(
          and(
            eq(galleryItems.shopId, shop.id),
            eq(galleryItems.generationId, generation.id),
          ),
        );
      if (!existing) throw new Error('gallery_items introuvable après conflit ON CONFLICT');
      row = existing;
    }

    const payload = addToGalleryResponseSchema.parse({
      item: await serializeGalleryItem(row, {
        renderType: generation.renderType,
        resultImageUrl: generation.resultImageUrl,
      }),
      created,
    });
    return reply.code(created ? 201 : 200).send(payload);
  });
}
