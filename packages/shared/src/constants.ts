import type { CreditPack } from './contracts.js';

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
