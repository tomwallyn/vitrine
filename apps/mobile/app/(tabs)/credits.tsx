import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { PackCard } from '@/components/PackCard';
import { useApi } from '@/lib/api';
import { t } from '@/lib/i18n';
import { useCreditPurchases } from '@/lib/purchases';
import {
  colors,
  CREDIT_PACKS,
  creditsToVisuals,
  packPricePerCredit,
  type CreditPacksResponse,
} from '@vitrine/shared';

/** Packs affichés immédiatement (mêmes constantes que GET /credit-packs). */
const FALLBACK_PACKS: CreditPacksResponse = {
  packs: CREDIT_PACKS.map((pack) => ({ ...pack, pricePerCreditEur: packPricePerCredit(pack) })),
};

const DEFAULT_PACK_ID = CREDIT_PACKS.find((pack) => pack.popular)?.id ?? 'credits_50';

/**
 * 07 — CRÉDITS : SOLDE ACTUEL (GET /credits) · RECHARGER (3 packs, achat
 * RevenueCat). Le crédit réel arrive via le webhook RevenueCat → après achat
 * on invalide `credits`/`me` (refetch).
 */
export default function CreditsScreen() {
  const api = useApi();
  const queryClient = useQueryClient();
  const [selectedPackId, setSelectedPackId] = useState(DEFAULT_PACK_ID);
  const [buying, setBuying] = useState(false);

  const creditsQuery = useQuery({ queryKey: ['credits'], queryFn: () => api.credits.get() });
  const packsQuery = useQuery({
    queryKey: ['credit-packs'],
    queryFn: () => api.credits.packs(),
    placeholderData: FALLBACK_PACKS,
  });

  const { status, packagesByPackId, purchase } = useCreditPurchases();

  const packs = packsQuery.data?.packs ?? FALLBACK_PACKS.packs;
  const selectedPack = packs.find((pack) => pack.id === selectedPackId) ?? packs[0];
  const selectedPackage = selectedPack ? packagesByPackId[selectedPack.id] : undefined;
  const balance = creditsQuery.data?.balance;

  /** Le crédit est ajouté par le webhook → refetch (immédiat + différé). */
  const refreshBalances = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['credits'] });
    void queryClient.invalidateQueries({ queryKey: ['me'] });
  }, [queryClient]);

  const onPurchaseSuccess = useCallback(() => {
    refreshBalances();
    setTimeout(refreshBalances, 4000);
    Alert.alert(t('credits.purchaseSuccessTitle'), t('credits.purchaseSuccessMessage'));
  }, [refreshBalances]);

  const onBuy = async () => {
    if (!selectedPack || !selectedPackage || buying) return;
    setBuying(true);
    const result = await purchase(selectedPackage);
    setBuying(false);
    if (result.outcome === 'success') onPurchaseSuccess();
    else if (result.outcome === 'error') Alert.alert(t('credits.purchaseErrorTitle'), result.message);
    // 'cancelled' → silencieux (annulation volontaire du sheet natif).
  };

  const purchaseUnavailable = status === 'unavailable' || (status === 'ready' && !selectedPackage);
  const canBuy = status === 'ready' && !!selectedPackage && !buying;
  const ctaPrice = selectedPackage?.product.priceString ?? `${selectedPack?.priceEur ?? ''} €`;

  return (
    <SafeAreaView className="flex-1 bg-paper">
      <ScrollView className="flex-1 px-5" contentContainerClassName="pb-4">
        <Text className="pt-4 font-heading-bold text-2xl text-ink">{t('credits.title')}</Text>

        {/* SOLDE ACTUEL — GET /credits */}
        <View className="mt-4 overflow-hidden rounded-3xl bg-ink px-6 py-6">
          <Text className="font-heading text-[11px] uppercase tracking-[2px] text-gray">
            {t('credits.balanceLabel')}
          </Text>
          {creditsQuery.isPending ? (
            <ActivityIndicator color={colors.offwhite} className="mt-4 self-start" />
          ) : creditsQuery.isError ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => creditsQuery.refetch()}
              className="mt-3"
            >
              <Text className="font-body text-sm text-paper3">
                {t('credits.balanceUnavailable')}{' '}
                <Text className="font-body-semibold underline">{t('common.retry')}</Text>
              </Text>
            </Pressable>
          ) : (
            <>
              <View className="mt-2 flex-row items-baseline gap-2">
                <Text className="font-heading-bold text-5xl text-white">{balance}</Text>
                <Text className="font-body-semibold text-base text-paper3">
                  {t('credits.unit')}
                </Text>
              </View>
              <Text className="mt-2 font-body-medium text-xs text-gray">
                {t('credits.balanceHint', { visuals: creditsToVisuals(balance ?? 0) })}
              </Text>
            </>
          )}
        </View>

        {/* RECHARGER — 3 packs (GET /credit-packs, achat via RevenueCat) */}
        <Text className="mb-3 mt-7 font-heading text-[11px] uppercase tracking-[2px] text-gray2">
          {t('credits.rechargeTitle')}
        </Text>
        <View className="gap-2.5">
          {packs.map((pack) => (
            <PackCard
              key={pack.id}
              pack={pack}
              selected={pack.id === selectedPack?.id}
              onPress={() => setSelectedPackId(pack.id)}
              priceLabel={packagesByPackId[pack.id]?.product.priceString}
            />
          ))}
        </View>

      </ScrollView>

      {/* CTA d'achat du pack sélectionné */}
      <View className="px-5 pb-2 pt-1">
        {purchaseUnavailable ? (
          <Text className="mb-2 text-center font-body text-xs text-gray">
            {t('credits.paymentUnavailable')}
          </Text>
        ) : null}
        <Button
          label={
            buying
              ? t('credits.buying')
              : t('credits.buyCta', { credits: selectedPack?.credits ?? '', price: ctaPrice })
          }
          onPress={onBuy}
          disabled={!canBuy}
        />
      </View>
    </SafeAreaView>
  );
}
