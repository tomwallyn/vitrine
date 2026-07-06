import { GENERATION_COST_CREDITS } from '@vitrine/shared';
import { eq, sql } from 'drizzle-orm';

import type { Db, TxDb } from '../db/client.js';
import { creditsLedger, shops } from '../db/schema.js';

/**
 * Ledger de crédits — design M3a :
 *
 * - Le ledger est append-only ; le solde = SUM(delta) (source de vérité unique).
 * - **Le hold EST le débit** : la ligne `generation_hold` (delta
 *   -GENERATION_COST_CREDITS) posée à la création de la génération débite
 *   immédiatement le solde. Il n'y a PAS de ligne `generation_commit` au succès
 *   (la raison reste dans l'enum pour un éventuel futur split réservation/
 *   confirmation, mais elle est inutilisée) : un succès ne change pas le solde,
 *   seul un échec le re-crédite.
 * - **Refund idempotent** : à l'échec, une ligne `refund` (delta
 *   +GENERATION_COST_CREDITS, ref = generation_id) n'est insérée QUE si aucun
 *   refund n'existe déjà pour cette génération — rejouer le webhook fal ne
 *   re-crédite pas deux fois.
 */

/** Solde insuffisant pour réserver un crédit (→ HTTP 402 côté route). */
export class InsufficientCreditsError extends Error {
  constructor(
    public readonly shopId: string,
    public readonly balance: number,
  ) {
    super(`Solde de crédits insuffisant (shop ${shopId} : ${balance} crédit(s))`);
    this.name = 'InsufficientCreditsError';
  }
}

/** SELECT du solde = COALESCE(SUM(delta), 0), réutilisable dans une transaction. */
function balanceQuery(db: Pick<Db, 'select'> | Pick<TxDb, 'select'>, shopId: string) {
  return db
    .select({ balance: sql<number>`coalesce(sum(${creditsLedger.delta}), 0)::int` })
    .from(creditsLedger)
    .where(eq(creditsLedger.shopId, shopId));
}

/** Solde de crédits = COALESCE(SUM(delta), 0) pour le shop. */
export async function getBalance(db: Db, shopId: string): Promise<number> {
  const [row] = await balanceQuery(db, shopId);
  return row?.balance ?? 0;
}

/**
 * Réserve (= débite, cf. design ci-dessus) GENERATION_COST_CREDITS crédits pour
 * une génération (le coût d'un visuel).
 *
 * Transaction interactive (driver WebSocket, cf. getTxDb) avec verrou
 * `SELECT ... FOR UPDATE` sur la ligne du shop : deux générations simultanées
 * du même shop sont sérialisées, le solde ne peut pas passer sous 0
 * (anti double-dépense).
 *
 * @returns l'id de la ligne de ledger du hold (à stocker en hold_ledger_id).
 * @throws InsufficientCreditsError si le solde est < GENERATION_COST_CREDITS.
 */
export async function holdCredit(
  txDb: TxDb,
  shopId: string,
  generationId: string,
): Promise<string> {
  return txDb.transaction(async (tx) => {
    // Verrou pessimiste sur le shop : sérialise les holds concurrents.
    await tx.execute(sql`select id from ${shops} where ${shops.id} = ${shopId} for update`);

    const [row] = await balanceQuery(tx, shopId);
    const balance = row?.balance ?? 0;
    if (balance < GENERATION_COST_CREDITS) {
      throw new InsufficientCreditsError(shopId, balance);
    }

    const [hold] = await tx
      .insert(creditsLedger)
      .values({
        shopId,
        delta: -GENERATION_COST_CREDITS,
        reason: 'generation_hold',
        ref: generationId,
      })
      .returning({ id: creditsLedger.id });
    if (!hold) {
      throw new Error(`Insertion du hold impossible (shop ${shopId}, génération ${generationId})`);
    }
    return hold.id;
  });
}

/**
 * Re-crédite GENERATION_COST_CREDITS crédits après l'échec d'une génération.
 * **Idempotent** : la
 * ligne `refund` n'est insérée que s'il existe un hold pour cette génération
 * ET qu'aucun refund n'existe déjà (statement SQL unique et atomique —
 * rejouer le webhook fal est sans effet).
 *
 * @returns l'id de la ligne de refund, ou null si no-op (déjà remboursé /
 *          aucun hold à rembourser).
 */
export async function refundCredit(
  db: Db,
  shopId: string,
  generationId: string,
): Promise<string | null> {
  const result = await db.execute(sql`
    insert into credits_ledger (shop_id, delta, reason, ref)
    select ${shopId}, ${GENERATION_COST_CREDITS}, 'refund', ${generationId}
    where exists (
      select 1 from credits_ledger
      where shop_id = ${shopId} and reason = 'generation_hold' and ref = ${generationId}
    )
    and not exists (
      select 1 from credits_ledger
      where shop_id = ${shopId} and reason = 'refund' and ref = ${generationId}
    )
    returning id
  `);
  const rows = result.rows as Array<{ id: string }>;
  return rows[0]?.id ?? null;
}
