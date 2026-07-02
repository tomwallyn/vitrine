import { randomUUID } from 'node:crypto';

import type { CreateGenerationRequest, Generation } from '@vitrine/shared';
import { and, eq, sql } from 'drizzle-orm';

import { getTxDb, type Db } from '../db/client.js';
import { generations } from '../db/schema.js';
import { submitToFal } from './ai/client.js';
import { resolveAiRoute } from './ai/config.js';
import { holdCredit, refundCredit } from './credits.js';

export type GenerationRow = typeof generations.$inferSelect;

/** Ligne Drizzle → contrat `Generation` de @vitrine/shared (dates ISO). */
export function serializeGeneration(row: GenerationRow): Generation {
  return {
    id: row.id,
    shopId: row.shopId,
    sourceImageUrl: row.sourceImageUrl,
    renderType: row.renderType,
    mannequinOption: row.modelOption,
    backgroundOption: row.backgroundOption,
    customBackgroundUrl: row.customBackgroundUrl,
    provider: row.provider,
    status: row.status,
    resultImageUrl: row.resultImageUrl,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Crée une génération de bout en bout (utilisé par POST /generations,
 * /regenerate et /variants) :
 *
 *   1. résout la route IA (provider figé) et construit l'input fal ;
 *   2. **hold 1 crédit** (transaction + FOR UPDATE, cf. services/credits.ts)
 *      — lève InsufficientCreditsError (→ 402) si solde < 1 ;
 *   3. insère la ligne `generations` (status `queued`, params + fond) ;
 *   4. soumet à la queue fal avec webhook → stocke provider_request_id,
 *      status `processing` ;
 *   5. si la soumission échoue → refund du crédit + status `failed`
 *      (la ligne est renvoyée telle quelle, la route décide du code HTTP).
 */
export async function createGeneration(
  db: Db,
  shopId: string,
  params: CreateGenerationRequest,
): Promise<GenerationRow> {
  // Id généré côté app : le hold référence la génération AVANT son insertion.
  const generationId = randomUUID();
  const route = resolveAiRoute(params.renderType, params.mannequinOption);
  const input = route.adapter.buildInput({
    sourceImageUrl: params.sourceImageUrl,
    renderType: params.renderType,
    mannequinOption: params.mannequinOption,
    backgroundOption: params.backgroundOption,
    customBackgroundUrl: params.customBackgroundUrl ?? null,
  });

  // 1 crédit réservé (= débité, cf. design du ledger). Throw → aucune ligne créée.
  const holdLedgerId = await holdCredit(getTxDb(), shopId, generationId);

  let row: GenerationRow;
  try {
    const [inserted] = await db
      .insert(generations)
      .values({
        id: generationId,
        shopId,
        sourceImageUrl: params.sourceImageUrl,
        renderType: params.renderType,
        modelOption: params.mannequinOption,
        backgroundOption: params.backgroundOption,
        customBackgroundUrl: params.customBackgroundUrl ?? null,
        provider: route.provider,
        status: 'queued',
        holdLedgerId,
      })
      .returning();
    if (!inserted) throw new Error('INSERT generations sans ligne retournée');
    row = inserted;
  } catch (err) {
    // La génération n'existe pas : on rend le crédit et on propage.
    await refundCredit(db, shopId, generationId);
    throw err;
  }

  try {
    const requestId = await submitToFal(route.endpoint, input, generationId);
    const [updated] = await db
      .update(generations)
      .set({ providerRequestId: requestId, status: 'processing' })
      .where(eq(generations.id, generationId))
      .returning();
    return updated ?? row;
  } catch (err) {
    // Soumission fal impossible → refund + failed (idempotent côté ledger).
    await refundCredit(db, shopId, generationId);
    const [failed] = await db
      .update(generations)
      .set({ status: 'failed', error: errorMessage(err), completedAt: new Date() })
      .where(eq(generations.id, generationId))
      .returning();
    return failed ?? { ...row, status: 'failed' as const, error: errorMessage(err) };
  }
}

/**
 * Nombre de générations `done` du shop — stat « Visuels » de l'écran 08
 * (le temps gagné en découle : × MINUTES_SAVED_PER_VISUAL).
 */
export async function countDoneGenerations(db: Db, shopId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(generations)
    .where(and(eq(generations.shopId, shopId), eq(generations.status, 'done')));
  return row?.count ?? 0;
}

/** Génération scopée propriétaire (shop courant) — null si absente/étrangère. */
export async function findOwnedGeneration(
  db: Db,
  shopId: string,
  generationId: string,
): Promise<GenerationRow | null> {
  const [row] = await db.select().from(generations).where(eq(generations.id, generationId));
  if (!row || row.shopId !== shopId) return null;
  return row;
}
