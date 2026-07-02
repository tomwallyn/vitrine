import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '@vitrine/shared';

const FILTERS = ['Tout', 'Sur modèle', 'Cintre'] as const;

const ITEMS = [
  { emoji: '🧥', title: 'Veste coach' },
  { emoji: '👗', title: 'Robe lin' },
  { emoji: '👔', title: 'Chemise oxford' },
  { emoji: '🧶', title: 'Pull torsadé' },
  { emoji: '👖', title: 'Jean brut' },
  { emoji: '🧣', title: 'Écharpe laine' },
];

/** 06 — GALERIE : « Mes créations », filtres + grille + FAB. */
export default function GalleryScreen() {
  const router = useRouter();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('Tout');

  return (
    <SafeAreaView className="flex-1 bg-paper">
      <View className="flex-1 px-5">
        <Text className="pt-4 font-heading-bold text-2xl text-ink">Mes créations</Text>

        {/* Filtres — TODO(M5): GET /gallery?filter=all|model|hanger */}
        <View className="mt-4 flex-row gap-2">
          {FILTERS.map((f) => {
            const selected = filter === f;
            return (
              <Pressable
                key={f}
                accessibilityRole="button"
                onPress={() => setFilter(f)}
                className={`rounded-full border px-4 py-2 ${
                  selected ? 'border-ink bg-ink' : 'border-paper3 bg-white'
                }`}
              >
                <Text
                  className={`font-body-semibold text-xs ${
                    selected ? 'text-offwhite' : 'text-ink'
                  }`}
                >
                  {f}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Grille 2 colonnes */}
        <ScrollView className="mt-4 flex-1" contentContainerClassName="pb-24">
          <View className="flex-row flex-wrap justify-between">
            {ITEMS.map((item) => (
              <View key={item.title} className="mb-4 w-[48%]">
                <View className="aspect-[3/4] items-center justify-center rounded-2xl border border-paper3 bg-paper2">
                  <Text className="text-4xl">{item.emoji}</Text>
                </View>
                <Text className="mt-2 font-body-semibold text-sm text-ink">{item.title}</Text>
                <Text className="font-body text-xs text-gray">Sur modèle</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      </View>

      {/* FAB + */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Nouveau visuel"
        onPress={() => router.push('/capture')}
        className="absolute bottom-6 right-5 h-14 w-14 items-center justify-center rounded-full bg-ink shadow-lg active:opacity-90"
      >
        <Ionicons name="add" size={28} color={colors.offwhite} />
      </Pressable>
    </SafeAreaView>
  );
}
