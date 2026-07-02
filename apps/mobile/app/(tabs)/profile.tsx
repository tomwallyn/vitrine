import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '@vitrine/shared';

const MENU: { icon: keyof typeof Ionicons.glyphMap; label: string; hint?: string }[] = [
  { icon: 'options-outline', label: 'Préréglages de rendu', hint: 'Style et mannequin par défaut' },
  { icon: 'water-outline', label: 'Export & filigrane', hint: 'Filigrane activé' },
  { icon: 'card-outline', label: 'Abonnement', hint: 'Aucun — packs de crédits' },
  { icon: 'help-circle-outline', label: 'Aide & contact' },
];

/** 08 — PROFIL : boutique + stats + réglages. */
export default function ProfileScreen() {
  const router = useRouter();

  return (
    <SafeAreaView className="flex-1 bg-paper">
      <ScrollView className="flex-1 px-5" contentContainerClassName="pb-6">
        <Text className="pt-4 font-heading-bold text-2xl text-ink">Profil</Text>

        {/* Boutique — TODO(M1): GET /me (Clerk + table shops) */}
        <View className="mt-4 flex-row items-center gap-4 rounded-3xl border border-paper3 bg-white px-5 py-5">
          <View className="h-14 w-14 items-center justify-center rounded-full bg-ink">
            <Text className="font-heading-bold text-lg text-offwhite">AN</Text>
          </View>
          <View className="flex-1">
            <Text className="font-heading-bold text-lg text-ink">L'Atelier Nord</Text>
            <Text className="font-body text-sm text-gray2">Lille · membre depuis 2026</Text>
          </View>
          <Ionicons name="pencil-outline" size={18} color={colors.gray2} />
        </View>

        {/* Stats : Visuels / Crédits / Temps gagné */}
        <View className="mt-4 flex-row gap-3">
          {[
            { value: '128', label: 'Visuels' },
            { value: '12', label: 'Crédits' },
            { value: '6 h', label: 'Temps gagné' },
          ].map((stat) => (
            <View
              key={stat.label}
              className="flex-1 items-center rounded-2xl border border-paper3 bg-white py-4"
            >
              <Text className="font-heading-bold text-xl text-ink">{stat.value}</Text>
              <Text className="mt-0.5 font-body text-xs text-gray2">{stat.label}</Text>
            </View>
          ))}
        </View>

        {/* Menu réglages */}
        <View className="mt-6 overflow-hidden rounded-3xl border border-paper3 bg-white">
          {MENU.map((item, i) => (
            <Pressable
              key={item.label}
              accessibilityRole="button"
              className={`flex-row items-center gap-3 px-5 py-4 active:bg-paper2 ${
                i > 0 ? 'border-t border-paper2' : ''
              }`}
            >
              <Ionicons name={item.icon} size={20} color={colors.gray3} />
              <View className="flex-1">
                <Text className="font-body-semibold text-sm text-ink">{item.label}</Text>
                {item.hint ? (
                  <Text className="font-body text-xs text-gray">{item.hint}</Text>
                ) : null}
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.gray} />
            </Pressable>
          ))}
        </View>

        {/* Déconnexion — TODO(M1): Clerk signOut */}
        <Pressable
          accessibilityRole="button"
          onPress={() => router.replace('/(onboarding)/welcome')}
          className="mt-6 items-center rounded-2xl border border-paper3 py-4 active:bg-paper2"
        >
          <Text className="font-body-semibold text-sm text-gray3">Se déconnecter</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
