import { RENDER_TYPE_LABELS, type RenderType } from '@vitrine/shared';
import { and, eq } from 'drizzle-orm';

import type { Db } from '../db/client.js';
import { galleryItems } from '../db/schema.js';

type GalleryItemRow = typeof galleryItems.$inferSelect;

/** Titre par défaut : type de rendu + date (« Sur modèle · 02/07/2026 »). */
export function defaultGalleryTitle(renderType: RenderType, when: Date): string {
  return `${RENDER_TYPE_LABELS[renderType]} · ${when.toLocaleDateString('fr-FR')}`;
}

/**
 * Ajoute (idempotent) une génération terminée à la galerie du shop.
 *
 * Appelé automatiquement à la finalisation d'une génération (auto-save : tout
 * visuel réussi rejoint la galerie) ET par la route POST /gallery (compat).
 * Jamais de doublon grâce à la contrainte unique (shop_id, generation_id) : un
 * conflit renvoie la ligne existante avec `created: false`.
 *
 * @param generation id + type de rendu + nom auto (peut être null au moment de
 *   la finalisation ; le titre retombe alors sur le défaut, mis à jour ensuite
 *   par le nommage auto).
 */
export async function ensureGalleryItem(
  db: Db,
  shopId: string,
  generation: { id: string; renderType: RenderType; name: string | null },
  opts?: { title?: string; tags?: string[] },
): Promise<{ row: GalleryItemRow; created: boolean }> {
  const [inserted] = await db
    .insert(galleryItems)
    .values({
      shopId,
      generationId: generation.id,
      // Titre = choix explicite > nom auto IA > « type de rendu · date ».
      title:
        opts?.title ?? generation.name ?? defaultGalleryTitle(generation.renderType, new Date()),
      // Tag par défaut = type de rendu (aligné sur les filtres de la galerie).
      tags: opts?.tags ?? [generation.renderType],
    })
    .onConflictDoNothing({ target: [galleryItems.shopId, galleryItems.generationId] })
    .returning();
  if (inserted) return { row: inserted, created: true };

  const [existing] = await db
    .select()
    .from(galleryItems)
    .where(and(eq(galleryItems.shopId, shopId), eq(galleryItems.generationId, generation.id)));
  if (!existing) throw new Error('gallery_items introuvable après conflit ON CONFLICT');
  return { row: existing, created: false };
}
