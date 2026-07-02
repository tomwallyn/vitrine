import {
  CREDIT_SUBSCRIPTION,
  findPackByProductId,
  isSubscriptionProductId,
} from '@vitrine/shared';

import type { TxDb } from '../db/client.js';
import { creditPurchases, creditsLedger } from '../db/schema.js';

/**
 * product_id RevenueCat → nombre de crédits à créditer :
 * packs consommables (credits_10 → 10, credits_50 → 50, credits_200 → 200,
 * préfixe reverse-DNS et base plan Google tolérés) + abonnement
 * (creditsPerPeriod à chaque période). null si produit inconnu.
 */
export function creditsForProduct(productId: string): number | null {
  const pack = findPackByProductId(productId);
  if (pack) return pack.credits;
  if (isSubscriptionProductId(productId)) return CREDIT_SUBSCRIPTION.creditsPerPeriod;
  return null;
}

export type ApplyPurchaseInput = {
  shopId: string;
  /** transaction_id RevenueCat — clé d'idempotence (unique en DB). */
  rcTransactionId: string;
  productId: string;
  credits: number;
  amountCents: number;
  currency: string;
};

/**
 * Crédite un achat validé par RevenueCat — **idempotent** :
 *
 * Une seule transaction (driver WebSocket, cf. getTxDb) qui :
 *   1. INSERT `credit_purchases` avec `ON CONFLICT (rc_transaction_id) DO
 *      NOTHING` — si la ligne existe déjà (webhook rejoué), RETURNING est
 *      vide et on s'arrête là : **pas de double crédit** ;
 *   2. sinon INSERT la ligne de ledger `{ reason: 'purchase', delta: +credits,
 *      ref: rc_transaction_id }` dans la même transaction (l'achat et son
 *      crédit sont atomiques : jamais l'un sans l'autre).
 *
 * @returns credited=false si l'événement avait déjà été traité (rejeu).
 */
export async function applyPurchase(
  txDb: TxDb,
  input: ApplyPurchaseInput,
): Promise<{ credited: boolean }> {
  return txDb.transaction(async (tx) => {
    const inserted = await tx
      .insert(creditPurchases)
      .values({
        shopId: input.shopId,
        rcTransactionId: input.rcTransactionId,
        productId: input.productId,
        credits: input.credits,
        amountCents: input.amountCents,
        currency: input.currency,
        status: 'completed',
      })
      .onConflictDoNothing({ target: creditPurchases.rcTransactionId })
      .returning({ id: creditPurchases.id });

    // Conflit sur rc_transaction_id → achat déjà crédité, no-op.
    if (inserted.length === 0) return { credited: false };

    await tx.insert(creditsLedger).values({
      shopId: input.shopId,
      delta: input.credits,
      reason: 'purchase',
      ref: input.rcTransactionId,
    });
    return { credited: true };
  });
}
