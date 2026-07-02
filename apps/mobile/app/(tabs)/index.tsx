import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CreditBadge } from '@/components/CreditBadge';
import { colors } from '@vitrine/shared';

/** Tab — ACCUEIL : CTA nouveau visuel + dernières créations. */
export default function HomeScreen() {
  const router = useRouter();

  return (
    <SafeAreaView className="flex-1 bg-paper">
      <ScrollView className="flex-1 px-5" contentContainerClassName="pb-6">
        {/* Header */}
        <View className="flex-row items-center justify-between pt-4">
          <View>
            <Text className="font-heading-bold text-lg uppercase tracking-[4px] text-ink">
              Vitrine
            </Text>
            <Text className="font-body text-xs text-gray2">L{"'"}Atelier Nord · Lille</Text>
          </View>
          <CreditBadge credits={12} />
        </View>

        {/* CTA principal : nouveau visuel */}
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/capture')}
          className="mt-6 items-center rounded-3xl bg-ink px-6 py-10 active:opacity-90"
        >
          <View className="h-14 w-14 items-center justify-center rounded-full bg-gray3">
            <Ionicons name="camera-outline" size={26} color={colors.offwhite} />
          </View>
          <Text className="mt-4 font-heading-bold text-xl text-offwhite">Nouveau visuel</Text>
          <Text className="mt-1 text-center font-body text-sm text-gray">
            Photographiez un vêtement sur cintre,{'\n'}obtenez un visuel pro en 30 s.
          </Text>
        </Pressable>

        {/* Stats rapides */}
        <View className="mt-4 flex-row gap-3">
          <View className="flex-1 rounded-2xl border border-paper3 bg-white px-4 py-3">
            <Text className="font-heading-bold text-xl text-ink">128</Text>
            <Text className="font-body text-xs text-gray2">Visuels créés</Text>
          </View>
          <View className="flex-1 rounded-2xl border border-paper3 bg-white px-4 py-3">
            <Text className="font-heading-bold text-xl text-ink">6 h</Text>
            <Text className="font-body text-xs text-gray2">Temps gagné</Text>
          </View>
        </View>

        {/* Dernières créations */}
        <View className="mt-8 flex-row items-center justify-between">
          <Text className="font-heading text-base text-ink">Dernières créations</Text>
          <Pressable onPress={() => router.push('/(tabs)/gallery')}>
            <Text className="font-body-semibold text-xs text-gray2">Tout voir</Text>
          </Pressable>
        </View>
        <View className="mt-3 flex-row gap-3">
          {['🧥', '👗', '👔'].map((emoji, i) => (
            <View
              key={i}
              className="aspect-[3/4] flex-1 items-center justify-center rounded-2xl border border-paper3 bg-paper2"
            >
              <Text className="text-3xl">{emoji}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
