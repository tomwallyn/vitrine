import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useApi } from '@/lib/api';
import { t } from '@/lib/i18n';
import { formatDate } from '@/lib/i18n/labels';
import { colors } from '@vitrine/shared';

/** Date FR courte d'une ligne d'achat (« 12 juin 2026 »). */
function purchaseDate(iso: string): string {
  return formatDate(iso, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Facturation (menu Profil) : historique des achats de crédits (lignes
 * `purchase` du ledger, GET /credits) + rappel du modèle « packs, sans
 * abonnement » + lien vers l'écran Crédits. Les reçus sont émis par
 * Apple / Google (paiement in-app).
 */
export default function BillingScreen() {
  const router = useRouter();
  const api = useApi();

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['credits', 'billing'],
    queryFn: () => api.credits.get({ limit: 100 }),
  });

  const purchases = (data?.history ?? []).filter((entry) => entry.reason === 'purchase');

  return (
    <SafeAreaView className="flex-1 bg-paper">
      <ScreenHeader title={t('billing.title')} />
      <ScrollView className="flex-1 px-5" contentContainerClassName="pt-2 pb-8">
        <Text className="font-heading-bold text-3xl text-ink">{t('billing.heading')}</Text>
        <Text className="mt-2 font-body text-base text-gray2">{t('billing.subtitle')}</Text>

        {/* Historique d'achats — lignes `purchase` du ledger */}
        <Text className="mb-3 mt-8 font-body-bold text-[11px] uppercase tracking-[3px] text-gray2">
          {t('billing.historyTitle')}
        </Text>

        {isPending ? (
          <View className="items-center rounded-3xl border border-paper3 bg-white px-5 py-8">
            <ActivityIndicator color={colors.ink} />
          </View>
        ) : isError ? (
          <View className="items-center rounded-3xl border border-paper3 bg-white px-5 py-6">
            <Text className="font-body text-sm text-gray2">{t('billing.loadError')}</Text>
            <Pressable accessibilityRole="button" onPress={() => refetch()} className="mt-3">
              <Text className="font-body-semibold text-sm text-ink underline">
                {t('common.retry')}
              </Text>
            </Pressable>
          </View>
        ) : purchases.length === 0 ? (
          <View className="items-center rounded-3xl border border-paper3 bg-white px-5 py-8">
            <Ionicons name="receipt-outline" size={24} color={colors.gray} />
            <Text className="mt-3 font-body-semibold text-sm text-ink">
              {t('billing.emptyTitle')}
            </Text>
            <Text className="mt-1 text-center font-body text-xs text-gray2">
              {t('billing.emptySubtitle')}
            </Text>
          </View>
        ) : (
          <View className="overflow-hidden rounded-3xl border border-paper3 bg-white">
            {purchases.map((entry, i) => (
              <View
                key={entry.id}
                className={`flex-row items-center gap-3 px-5 py-4 ${
                  i > 0 ? 'border-t border-paper2' : ''
                }`}
              >
                <View className="h-9 w-9 items-center justify-center rounded-full bg-paper2">
                  <Ionicons name="card-outline" size={16} color={colors.ink} />
                </View>
                <View className="flex-1">
                  <Text className="font-body-semibold text-sm text-ink">
                    {t('billing.packLabel')}
                  </Text>
                  <Text className="font-body text-xs text-gray2">
                    {purchaseDate(entry.createdAt)}
                  </Text>
                </View>
                <Text className="font-heading-bold text-base text-ink">
                  +{t('common.credits', { count: entry.delta })}
                </Text>
              </View>
            ))}
          </View>
        )}

        <Button
          label={t('billing.rechargeCta')}
          className="mt-8"
          onPress={() => router.push('/(tabs)/credits')}
        />
        <Text className="mt-4 text-center font-body text-xs text-gray">
          {t('billing.subscriptionNote')}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
