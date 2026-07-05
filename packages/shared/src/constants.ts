import type { CreditPack } from './contracts.js';
import type { RenderType } from './enums.js';

/** Libellés FR des types de rendu (écrans 03/05/06 + titres de galerie). */
export const RENDER_TYPE_LABELS: Record<RenderType, string> = {
  // Vêtement
  model: 'Sur modèle',
  hanger: 'Sur cintre',
  folded: 'Plié à plat',
  studio: 'Fond studio',
  // Objet
  studio_uni: 'Studio uni',
  texture: 'Texturé',
  mise_en_situation: 'Mise en situation',
  ambiance: 'Ambiance',
  macro: 'Macro détail',
  exterieur: 'Extérieur',
} as const;

/**
 * Les 3 packs de crédits (écran 07), miroir des consommables RevenueCat.
 * 1 visuel = {@link GENERATION_COST_CREDITS} crédits. Prix cible/photo : 1,60 €
 * (Découverte) → 1,40 € (−12 %) → 1,28 € (−20 %).
 */
export const CREDIT_PACKS: readonly CreditPack[] = [
  { id: 'credits_50', credits: 50, priceEur: 7.99 },
  { id: 'credits_200', credits: 200, priceEur: 27.99, popular: true },
  { id: 'credits_500', credits: 500, priceEur: 63.99 },
] as const;

/** Coût d'une génération, en crédits (1 visuel = 10 crédits). */
export const GENERATION_COST_CREDITS = 10;

/** Nombre de visuels finançables par un solde de crédits (solde ÷ coût). */
export function creditsToVisuals(credits: number): number {
  return Math.floor(Math.max(0, credits) / GENERATION_COST_CREDITS);
}

/**
 * Crédits offerts à la création de la boutique (première connexion).
 * Crédités UNE SEULE FOIS, à l'INSERT du shop (ledger `bonus`, cf.
 * services/shops.ts côté API) — jamais rétroactif pour les shops existants.
 */
export const SIGNUP_BONUS_CREDITS = 50;

/**
 * Minutes « gagnées » par visuel généré (vs shooting produit artisanal :
 * installation, prise de vue, retouche). Base de la stat « Temps gagné »
 * de l'écran 08 : timeSavedMinutes = visualsCount × 15.
 */
export const MINUTES_SAVED_PER_VISUAL = 15;

/** Temps gagné (minutes) pour un nombre de visuels générés. */
export function timeSavedMinutes(visualsCount: number): number {
  return Math.max(0, visualsCount) * MINUTES_SAVED_PER_VISUAL;
}

/**
 * Formate le temps gagné pour l'écran 08 : « 45 min » sous l'heure,
 * sinon arrondi à l'heure — ex. 2460 min → « ~41h ».
 */
export function formatTimeSaved(minutes: number): string {
  if (minutes < 60) return `${Math.max(0, Math.round(minutes))} min`;
  return `~${Math.round(minutes / 60)}h`;
}

/** Prix par crédit d'un pack, arrondi au centime (0,16 / 0,14 / 0,128 €). */
export function packPricePerCredit(pack: CreditPack): number {
  return Math.round((pack.priceEur / pack.credits) * 100) / 100;
}

/**
 * Remise (%) d'un pack par rapport au prix/crédit le plus cher (pack Découverte),
 * arrondie à l'entier supérieur — badges « −12 % » (Boutique) / « −20 % » (Pro).
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
