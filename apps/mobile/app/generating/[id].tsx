import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { colors } from '@vitrine/shared';

type Step = { label: string; state: 'done' | 'active' | 'pending' };

const STEPS: Step[] = [
  { label: 'Analyse du vêtement', state: 'done' },
  { label: 'Génération du visuel', state: 'active' },
  { label: 'Finitions studio', state: 'pending' },
];

/** 04 — GÉNÉRATION : progression + 3 étapes (polling branché en M3). */
export default function GeneratingScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <SafeAreaView className="flex-1 bg-paper">
      <View className="flex-1 items-center justify-center px-8">
        {/* Vignette source */}
        <View className="h-40 w-32 items-center justify-center rounded-2xl border border-paper3 bg-paper2">
          <Text className="text-4xl">🧥</Text>
        </View>

        <Text className="mt-8 font-heading-bold text-2xl text-ink">Création en cours…</Text>
        <Text className="mt-2 text-center font-body text-sm text-gray2">
          Votre visuel pro arrive dans ~30 secondes.
        </Text>

        {/* Barre de progression (statique M0 — polling GET /generations/:id en M3) */}
        <View className="mt-8 h-1.5 w-full overflow-hidden rounded-full bg-paper3">
          <View className="h-full w-3/5 rounded-full bg-ink" />
        </View>

        {/* 3 étapes */}
        <View className="mt-8 w-full gap-4">
          {STEPS.map((step) => (
            <View key={step.label} className="flex-row items-center gap-3">
              {step.state === 'done' ? (
                <View className="h-6 w-6 items-center justify-center rounded-full bg-ink">
                  <Ionicons name="checkmark" size={14} color={colors.offwhite} />
                </View>
              ) : step.state === 'active' ? (
                <View className="h-6 w-6 items-center justify-center rounded-full border-2 border-ink">
                  <View className="h-2 w-2 rounded-full bg-ink" />
                </View>
              ) : (
                <View className="h-6 w-6 rounded-full border border-paper3 bg-paper2" />
              )}
              <Text
                className={`font-body-semibold text-sm ${
                  step.state === 'pending' ? 'text-gray' : 'text-ink'
                }`}
              >
                {step.label}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {/* Navigation de démo (retirée en M3 au profit du polling) */}
      <View className="px-6 pb-6">
        <Button
          label="Voir le résultat (démo)"
          variant="secondary"
          onPress={() => router.replace(`/result/${id ?? 'demo'}`)}
        />
      </View>
    </SafeAreaView>
  );
}
