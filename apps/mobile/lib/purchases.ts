import { useAuth } from '@clerk/clerk-expo';
import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { findPackByProductId, isSubscriptionProductId } from '@vitrine/shared';

import type { PurchasesError, PurchasesPackage } from 'react-native-purchases';

/**
 * Intégration RevenueCat (react-native-purchases) — **paresseuse et gardée** :
 *
 * - le SDK n'est chargé (require) et configuré que si la clé publique
 *   EXPO_PUBLIC_REVENUECAT_IOS_KEY / _ANDROID_KEY est présente ;
 * - sans clé ou sans module natif (Expo Go, build web), rien ne crashe :
 *   l'écran Crédits affiche solde + packs et désactive l'achat
 *   (« configuration paiement requise ») ;
 * - `appUserID` = Clerk uid → le webhook API résout le shop par `app_user_id`.
 */

type PurchasesModule = typeof import('react-native-purchases').default;

/** Clé publique SDK RevenueCat de la plateforme courante (null si absente). */
const REVENUECAT_API_KEY =
  Platform.select({
    ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
    android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY,
  }) || null;

let purchasesModule: PurchasesModule | null | undefined;

/** Charge le SDK si une clé est configurée — null sinon (jamais de throw). */
function loadPurchases(): PurchasesModule | null {
  if (purchasesModule !== undefined) return purchasesModule;
  if (!REVENUECAT_API_KEY) {
    purchasesModule = null;
    return null;
  }
  try {
    // Require paresseux : évite tout effet de bord au chargement du bundle.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    purchasesModule = (require('react-native-purchases') as { default: PurchasesModule }).default;
  } catch {
    purchasesModule = null;
  }
  return purchasesModule;
}

let configuredForUserId: string | null = null;

/**
 * Configure le SDK pour l'utilisateur Clerk courant (idempotent ; logIn si
 * l'utilisateur change). Retourne null si indisponible (clé absente, module
 * natif non linké — Expo Go…) : l'appelant désactive l'achat sans crasher.
 */
async function configurePurchases(appUserId: string): Promise<PurchasesModule | null> {
  const Purchases = loadPurchases();
  if (!Purchases || !REVENUECAT_API_KEY) return null;
  try {
    if (configuredForUserId === null) {
      Purchases.configure({ apiKey: REVENUECAT_API_KEY, appUserID: appUserId });
      configuredForUserId = appUserId;
    } else if (configuredForUserId !== appUserId) {
      await Purchases.logIn(appUserId);
      configuredForUserId = appUserId;
    }
    return Purchases;
  } catch {
    // Module natif absent (Expo Go / web) → paiement indisponible, pas de crash.
    return null;
  }
}

export type PurchasesStatus = 'loading' | 'ready' | 'unavailable';

export type PurchaseResult =
  | { outcome: 'success' }
  | { outcome: 'cancelled' }
  | { outcome: 'error'; message: string };

export type CreditPurchases = {
  /** 'unavailable' → achat désactivé (« configuration paiement requise »). */
  status: PurchasesStatus;
  /** Package RevenueCat par id de pack (credits_10 / credits_50 / credits_200). */
  packagesByPackId: Record<string, PurchasesPackage>;
  /** Package de l'abonnement (upsell « Passer à l'abonnement »), si offert. */
  subscriptionPackage: PurchasesPackage | null;
  /** Lance l'achat natif d'un package (pack ou abonnement). */
  purchase: (pkg: PurchasesPackage) => Promise<PurchaseResult>;
};

/**
 * Hook de l'écran 07 : configure RevenueCat pour l'utilisateur Clerk courant,
 * charge l'offering courant et mappe ses packages sur les packs de crédits
 * (product_id → pack via @vitrine/shared) + l'abonnement.
 */
export function useCreditPurchases(): CreditPurchases {
  const { userId } = useAuth();
  const [status, setStatus] = useState<PurchasesStatus>(
    REVENUECAT_API_KEY ? 'loading' : 'unavailable',
  );
  const [packagesByPackId, setPackagesByPackId] = useState<Record<string, PurchasesPackage>>({});
  const [subscriptionPackage, setSubscriptionPackage] = useState<PurchasesPackage | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!userId || !REVENUECAT_API_KEY) {
        setStatus('unavailable');
        return;
      }
      const Purchases = await configurePurchases(userId);
      if (!Purchases) {
        if (!cancelled) setStatus('unavailable');
        return;
      }
      try {
        const offerings = await Purchases.getOfferings();
        const available = offerings.current?.availablePackages ?? [];
        const byPackId: Record<string, PurchasesPackage> = {};
        let subscription: PurchasesPackage | null = null;
        for (const pkg of available) {
          const pack = findPackByProductId(pkg.product.identifier);
          if (pack) {
            byPackId[pack.id] = pkg;
          } else if (
            isSubscriptionProductId(pkg.product.identifier) ||
            String(pkg.product.productCategory) === 'SUBSCRIPTION'
          ) {
            subscription = pkg;
          }
        }
        if (!cancelled) {
          setPackagesByPackId(byPackId);
          setSubscriptionPackage(subscription);
          setStatus('ready');
        }
      } catch {
        if (!cancelled) setStatus('unavailable');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const purchase = useCallback(async (pkg: PurchasesPackage): Promise<PurchaseResult> => {
    const Purchases = loadPurchases();
    if (!Purchases) {
      return { outcome: 'error', message: 'Paiement indisponible sur cet appareil.' };
    }
    try {
      // RevenueCat valide le reçu → webhook API → +N crédits au ledger.
      await Purchases.purchasePackage(pkg);
      return { outcome: 'success' };
    } catch (err) {
      if ((err as PurchasesError).userCancelled) return { outcome: 'cancelled' };
      const message =
        err instanceof Error && err.message ? err.message : 'Achat impossible pour le moment.';
      return { outcome: 'error', message };
    }
  }, []);

  return { status, packagesByPackId, subscriptionPackage, purchase };
}
