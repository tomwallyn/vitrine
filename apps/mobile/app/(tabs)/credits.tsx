import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Badge } from '@/components/Badge';
import { CREDIT_PACKS, type CreditPack } from '@vitrine/shared';

function PackCard({ pack }: { pack: CreditPack }) {
  const perCredit = (pack.priceEur / pack.credits).toFixed(2).replace('.', ',');
  return (
    <Pressable
      accessibilityRole="button"
      className={`rounded-3xl border px-5 py-5 ${
        pack.popular ? 'border-ink bg-ink' : 'border-paper3 bg-white active:bg-paper2'
      }`}
    >
      {pack.popular ? <Badge label="Populaire" variant="light" className="mb-3" /> : null}
      <View className="flex-row items-end justify-between">
        <View>
          <Text
            className={`font-heading-bold text-2xl ${pack.popular ? 'text-offwhite' : 'text-ink'}`}
          >
            {pack.credits} crédits
          </Text>
          <Text className={`mt-1 font-body text-xs ${pack.popular ? 'text-gray' : 'text-gray2'}`}>
            soit {perCredit} € / visuel
          </Text>
        </View>
        <Text
          className={`font-heading-bold text-xl ${pack.popular ? 'text-offwhite' : 'text-ink'}`}
        >
          {pack.priceEur} €
        </Text>
      </View>
    </Pressable>
  );
}

/** 07 — CRÉDITS : solde + 3 packs (paywall RevenueCat en M4). */
export default function CreditsScreen() {
  return (
    <SafeAreaView className="flex-1 bg-paper">
      <ScrollView className="flex-1 px-5" contentContainerClassName="pb-6">
        <Text className="pt-4 font-heading-bold text-2xl text-ink">Crédits</Text>

        {/* Solde — TODO(M4): GET /credits */}
        <View className="mt-4 items-center rounded-3xl border border-paper3 bg-white py-8">
          <Text className="font-heading-bold text-5xl text-ink">12</Text>
          <Text className="mt-1 font-body text-sm text-gray2">crédits restants</Text>
          <Text className="mt-0.5 font-body text-xs text-gray">1 crédit = 1 visuel généré</Text>
        </View>

        {/* Packs — TODO(M4): paywall RevenueCat (achats consommables) */}
        <Text className="mb-3 mt-8 font-body-bold text-[11px] uppercase tracking-[3px] text-gray2">
          Recharger
        </Text>
        <View className="gap-3">
          {CREDIT_PACKS.map((pack) => (
            <PackCard key={pack.id} pack={pack} />
          ))}
        </View>

        {/* Upsell abonnement */}
        <Pressable
          accessibilityRole="button"
          className="mt-6 items-center rounded-2xl border border-dashed border-gray px-5 py-4 active:bg-paper2"
        >
          <Text className="font-body-semibold text-sm text-ink">Passer à l'abonnement</Text>
          <Text className="mt-1 font-body text-xs text-gray2">
            Crédits chaque mois, moins cher au visuel
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
