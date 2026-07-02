import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useApi } from '@/lib/api';
import { colors } from '@vitrine/shared';

/** Date FR courte d'une ligne d'achat (« 12 juin 2026 »). */
function purchaseDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
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
      <ScreenHeader title="Facturation" />
      <ScrollView className="flex-1 px-5" contentContainerClassName="pt-2 pb-8">
        <Text className="font-heading-bold text-3xl text-ink">Vos achats.</Text>
        <Text className="mt-2 font-body text-base text-gray2">
          VITRINE fonctionne par packs de crédits, sans engagement. Les paiements et reçus sont
          gérés par l{"'"}App Store ou Google Play.
        </Text>

        {/* Historique d'achats — lignes `purchase` du ledger */}
        <Text className="mb-3 mt-8 font-body-bold text-[11px] uppercase tracking-[3px] text-gray2">
          Historique d{"'"}achats
        </Text>

        {isPending ? (
          <View className="items-center rounded-3xl border border-paper3 bg-white px-5 py-8">
            <ActivityIndicator color={colors.ink} />
          </View>
        ) : isError ? (
          <View className="items-center rounded-3xl border border-paper3 bg-white px-5 py-6">
            <Text className="font-body text-sm text-gray2">
              Impossible de charger votre historique.
            </Text>
            <Pressable accessibilityRole="button" onPress={() => refetch()} className="mt-3">
              <Text className="font-body-semibold text-sm text-ink underline">Réessayer</Text>
            </Pressable>
          </View>
        ) : purchases.length === 0 ? (
          <View className="items-center rounded-3xl border border-paper3 bg-white px-5 py-8">
            <Ionicons name="receipt-outline" size={24} color={colors.gray} />
            <Text className="mt-3 font-body-semibold text-sm text-ink">
              Aucun achat pour le moment
            </Text>
            <Text className="mt-1 text-center font-body text-xs text-gray2">
              Vos packs de crédits achetés apparaîtront ici.
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
                  <Text className="font-body-semibold text-sm text-ink">Pack de crédits</Text>
                  <Text className="font-body text-xs text-gray2">
                    {purchaseDate(entry.createdAt)}
                  </Text>
                </View>
                <Text className="font-heading-bold text-base text-ink">
                  +{entry.delta} crédit{entry.delta > 1 ? 's' : ''}
                </Text>
              </View>
            ))}
          </View>
        )}

        <Button
          label="Recharger des crédits"
          className="mt-8"
          onPress={() => router.push('/(tabs)/credits')}
        />
        <Text className="mt-4 text-center font-body text-xs text-gray">
          Abonnement mensuel : proposé depuis l{"'"}écran Crédits, géré ensuite dans les réglages
          App Store / Google Play.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
