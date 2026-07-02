import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { ScreenHeader } from '@/components/ScreenHeader';
import { colors } from '@vitrine/shared';

function ActionChip({ icon, label }: { icon: keyof typeof Ionicons.glyphMap; label: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      className="flex-1 items-center gap-1.5 rounded-2xl border border-paper3 bg-white py-3.5 active:bg-paper2"
    >
      <Ionicons name={icon} size={18} color={colors.ink} />
      <Text className="font-body-semibold text-xs text-ink">{label}</Text>
    </Pressable>
  );
}

/** 05 — RÉSULTAT : comparateur AVANT/APRÈS + actions + galerie. */
export default function ResultScreen() {
  const router = useRouter();
  useLocalSearchParams<{ id: string }>();

  return (
    <SafeAreaView className="flex-1 bg-paper">
      <ScreenHeader title="Résultat" subtitle="Étape 3/3" />

      <ScrollView className="flex-1 px-5" contentContainerClassName="pb-6">
        {/* Comparateur AVANT / APRÈS (slider interactif en M3) */}
        <View className="flex-row gap-3">
          <View className="flex-1">
            <View className="aspect-[3/4] items-center justify-center rounded-3xl border border-paper3 bg-paper2">
              <Text className="text-4xl">🧥</Text>
            </View>
            <Badge label="Avant" variant="light" className="mt-2 self-center" />
          </View>
          <View className="flex-1">
            <View className="aspect-[3/4] items-center justify-center rounded-3xl bg-ink">
              <Text className="text-4xl">🧍</Text>
            </View>
            <Badge label="Après" className="mt-2 self-center" />
          </View>
        </View>

        <Text className="mt-4 text-center font-body text-xs text-gray">
          Sur modèle · Femme · Fond studio
        </Text>

        {/* Actions secondaires */}
        <View className="mt-6 flex-row gap-3">
          {/* TODO(M3): POST /generations/:id/regenerate (1 crédit) */}
          <ActionChip icon="refresh" label="Régénérer" />
          {/* TODO(M3): POST /generations/:id/variants */}
          <ActionChip icon="albums-outline" label="Variantes" />
          {/* TODO(M5): export + filigrane selon settings */}
          <ActionChip icon="share-outline" label="Exporter" />
        </View>
      </ScrollView>

      {/* CTA principal */}
      <View className="border-t border-paper3 px-5 pb-4 pt-3">
        <Button
          label="Ajouter à ma galerie"
          onPress={() => router.replace('/(tabs)/gallery')}
        />
      </View>
    </SafeAreaView>
  );
}
