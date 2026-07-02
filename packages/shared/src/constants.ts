import type { CreditPack } from './contracts.js';
import type { RenderType } from './enums.js';

/** Libellés FR des types de rendu (écrans 03/05/06 + titres de galerie). */
export const RENDER_TYPE_LABELS: Record<RenderType, string> = {
  model: 'Sur modèle',
  hanger: 'Sur cintre',
  folded: 'Plié à plat',
  studio: 'Fond studio',
} as const;

/**
 * Les 3 packs de crédits (écran 07), miroir des consommables RevenueCat.
 * 1 crédit = 1 visuel généré.
 */
export const CREDIT_PACKS: readonly CreditPack[] = [
  { id: 'credits_10', credits: 10, priceEur: 9 },
  { id: 'credits_50', credits: 50, priceEur: 34, popular: true },
  { id: 'credits_200', credits: 200, priceEur: 110 },
] as const;

/** Coût d'une génération, en crédits. */
export const GENERATION_COST_CREDITS = 1;

/**
 * Abonnement auto-renouvelable (upsell « Passer à l'abonnement » de l'écran 07).
 * Crédite `creditsPerPeriod` à chaque période via le webhook RevenueCat
 * (INITIAL_PURCHASE / RENEWAL). Pricing store à affiner en M6.
 */
export const CREDIT_SUBSCRIPTION = {
  productId: 'vitrine_sub_monthly',
  creditsPerPeriod: 50,
} as const;

/** Prix par visuel d'un pack, arrondi au centime (0,90 / 0,68 / 0,55 €). */
export function packPricePerCredit(pack: CreditPack): number {
  return Math.round((pack.priceEur / pack.credits) * 100) / 100;
}

/**
 * Remise (%) d'un pack par rapport au prix/visuel le plus cher (pack de 10),
 * arrondie à l'entier supérieur — badge « −25 % » du pack 50 (maquette 07).
 */
export function packDiscountPercent(pack: CreditPack): number {
  const reference = Math.max(...CREDIT_PACKS.map((p) => p.priceEur / p.credits));
  return Math.max(0, Math.ceil((1 - pack.priceEur / pack.credits / reference) * 100));
}

/**
 * Formes candidates d'un product_id RevenueCat : id brut, sans le base plan
 * Google (`credits_50:default` → `credits_50`) et sans un éventuel préfixe
 * reverse-DNS (`app.vitrine.credits_50` → `credits_50`).
 */
function productIdCandidates(productId: string): string[] {
  const base = productId.split(':')[0] ?? productId;
  const suffix = base.split('.').pop() ?? base;
  return [productId, base, suffix];
}

/** product_id RevenueCat (App Store / Play Store) → pack de crédits, sinon undefined. */
export function findPackByProductId(productId: string): CreditPack | undefined {
  const candidates = productIdCandidates(productId);
  return CREDIT_PACKS.find((pack) => candidates.includes(pack.id));
}

/** true si le product_id RevenueCat correspond à l'abonnement (upsell). */
export function isSubscriptionProductId(productId: string): boolean {
  return productIdCandidates(productId).includes(CREDIT_SUBSCRIPTION.productId);
}
