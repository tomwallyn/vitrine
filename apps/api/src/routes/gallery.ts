import {
  addToGalleryRequestSchema,
  addToGalleryResponseSchema,
  galleryQuerySchema,
  galleryResponseSchema,
  type GalleryItem,
  type RenderType,
} from '@vitrine/shared';
import { and, asc, count, desc, eq, ilike, type SQL } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import { getDb, getTxDb } from '../db/client.js';
import { galleryItems, generations } from '../db/schema.js';
import { ensureGalleryItem } from '../services/gallery.js';
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

/**
 * Galerie « Mes créations » (écran 06) :
 * - GET    /gallery?filter=… : items du shop joints à leur génération (vignette
 *   = result_image_url + render_type), paginés, filtrés, triés par date.
 * - POST   /gallery : ajout manuel (compat) — idempotent. Depuis l'auto-save,
 *   tout visuel réussi est déjà ajouté à la finalisation ; cette route reste
 *   pour ré-ajouter un visuel supprimé.
 * - DELETE /gallery/:id : retire un visuel de la galerie du shop.
 */
export function registerGalleryRoutes(app: FastifyInstance): void {
  app.get('/gallery', async (req, reply) => {
    const parsed = galleryQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: 'Bad Request', details: parsed.error.flatten().fieldErrors });
    }
    const { q, filter, sort, limit, offset } = parsed.data;

    const db = getDb();
    const shop = await upsertShopByAuthId(getTxDb(), req.authUserId);

    const conditions: SQL[] = [eq(galleryItems.shopId, shop.id)];
    // Vêtements/Objets → filtre par type de sujet ; model/hanger → par type de rendu.
    if (filter === 'vetement' || filter === 'objet') {
      conditions.push(eq(generations.subjectType, filter));
    } else if (filter !== 'all') {
      conditions.push(eq(generations.renderType, filter));
    }
    if (q) conditions.push(ilike(galleryItems.title, `%${q}%`));
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

    const { row, created } = await ensureGalleryItem(db, shop.id, generation, {
      title: parsed.data.title,
      tags: parsed.data.tags,
    });

    const payload = addToGalleryResponseSchema.parse({
      item: await serializeGalleryItem(row, {
        renderType: generation.renderType,
        resultImageUrl: generation.resultImageUrl,
      }),
      created,
    });
    return reply.code(created ? 201 : 200).send(payload);
  });

  app.delete('/gallery/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const db = getDb();
    const shop = await upsertShopByAuthId(getTxDb(), req.authUserId);

    // Ne supprime que l'item galerie du shop courant (la génération + le rendu
    // stocké restent — retrait de la vue « Mes créations » uniquement).
    const [deleted] = await db
      .delete(galleryItems)
      .where(and(eq(galleryItems.id, id), eq(galleryItems.shopId, shop.id)))
      .returning({ id: galleryItems.id });
    if (!deleted) return reply.code(404).send({ error: 'Not Found' });
    return reply.code(200).send({ ok: true });
  });

  // Retrait par génération (l'écran résultat n'a que l'id de génération, pas l'id
  // de l'item galerie). Supprime l'item galerie du shop pour cette génération.
  app.delete('/gallery/generation/:generationId', async (req, reply) => {
    const { generationId } = req.params as { generationId: string };
    const db = getDb();
    const shop = await upsertShopByAuthId(getTxDb(), req.authUserId);

    const [deleted] = await db
      .delete(galleryItems)
      .where(and(eq(galleryItems.generationId, generationId), eq(galleryItems.shopId, shop.id)))
      .returning({ id: galleryItems.id });
    if (!deleted) return reply.code(404).send({ error: 'Not Found' });
    return reply.code(200).send({ ok: true });
  });
}
