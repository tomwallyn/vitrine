import { Ionicons } from '@expo/vector-icons';
import { useQueries } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useApi } from '@/lib/api';
import { colors, type GenerationStatus } from '@vitrine/shared';

/**
 * Cadence du polling GET /generations/:id — ces GET déclenchent la
 * finalisation côté serveur. Même queryKey que l'écran 04 et le tracker
 * global : cache partagé + déduplication des requêtes en vol.
 */
const POLL_INTERVAL_MS = 2_000;

/** Ligne de statut d'un item du lot (droite de la rangée). */
function ItemStatus({ status }: { status: GenerationStatus | undefined }) {
  if (status === 'done') {
    return (
      <View className="flex-row items-center gap-1.5">
        <Ionicons name="checkmark-circle" size={16} color={colors.ink} />
        <Text className="font-body-bold text-xs text-ink">Prêt</Text>
      </View>
    );
  }
  if (status === 'failed') {
    return (
      <View className="flex-row items-center gap-1.5">
        <Ionicons name="alert-circle-outline" size={16} color={colors.gray2} />
        <Text className="font-body-semibold text-xs text-gray2">Échec · remboursé</Text>
      </View>
    );
  }
  if (status === 'processing') {
    return (
      <View className="flex-row items-center gap-2">
        {/* Mini-barre indéterminée : le serveur n'expose pas de % par item */}
        <View className="h-1 w-14 overflow-hidden rounded-full bg-paper3">
          <View className="h-full w-3/5 rounded-full bg-ink" />
        </View>
        <ActivityIndicator size="small" color={colors.ink} />
      </View>
    );
  }
  // queued / premier fetch en cours
  return (
    <View className="flex-row items-center gap-1.5">
      <Text className="font-body-semibold text-xs text-gray2">En attente</Text>
      <Text className="font-body-bold text-xs tracking-[2px] text-gray">•••</Text>
    </View>
  );
}

/** 04c — GÉNÉRATION DU LOT : compteur global + statut par pièce (polling ~2 s). */
export default function BatchProgressScreen() {
  const router = useRouter();
  const api = useApi();
  const { ids: idsParam } = useLocalSearchParams<{ ids: string }>();

  /** Ids du lot, passés par l'écran /batch : `ids=id1,id2,...`. */
  const ids = useMemo(
    () => (idsParam ? idsParam.split(',').filter(Boolean) : []),
    [idsParam],
  );

  // Un poll par génération, tant qu'elle est queued/processing.
  const results = useQueries({
    queries: ids.map((id) => ({
      queryKey: ['generation', id],
      queryFn: () => api.generations.get(id),
      staleTime: 0,
      refetchInterval: (query: { state: { data?: { generation: { status: GenerationStatus } } } }) => {
        const status = query.state.data?.generation.status;
        return !status || status === 'queued' || status === 'processing'
          ? POLL_INTERVAL_MS
          : false;
      },
    })),
  });

  const generations = results.map((r) => r.data?.generation);
  const doneCount = generations.filter((g) => g?.status === 'done').length;
  const settledCount = generations.filter(
    (g) => g?.status === 'done' || g?.status === 'failed',
  ).length;
  const total = ids.length;
  const progressPercent = total > 0 ? Math.max((settledCount / total) * 100, 3) : 0;
  const allSettled = total > 0 && settledCount === total;

  return (
    <SafeAreaView className="flex-1 bg-paper">
      <ScreenHeader title="Génération du lot" />

      <ScrollView className="flex-1 px-5" contentContainerClassName="pb-6">
        {/* Compteur global + barre de progression du lot */}
        <View className="mt-2 rounded-3xl border border-paper3 bg-paper2 px-5 py-5">
          <Text className="font-heading-bold text-3xl text-ink">
            {doneCount} / {total}
          </Text>
          <Text className="mt-1 font-body-medium text-xs text-gray2">
            visuel{doneCount > 1 ? 's' : ''} terminé{doneCount > 1 ? 's' : ''}
          </Text>
          <View className="mt-4 h-1.5 overflow-hidden rounded-full bg-paper3">
            <View
              className="h-full rounded-full bg-ink"
              style={{ width: `${progressPercent}%` }}
            />
          </View>
        </View>

        {/* Note — le tracker global + notifications suivent le lot en fond */}
        {!allSettled ? (
          <View className="mt-4 flex-row items-center gap-2.5 rounded-2xl border border-paper3 bg-paper2 px-4 py-3">
            <Ionicons name="notifications-outline" size={18} color={colors.gray3} />
            <Text className="flex-1 font-body text-xs leading-4 text-gray2">
              Vous pouvez quitter — on vous prévient à la fin.
            </Text>
          </View>
        ) : null}

        {/* Liste par pièce : vignette + statut, tap sur une pièce prête → résultat */}
        <View className="mt-5 gap-3">
          {ids.map((id, index) => {
            const generation = generations[index];
            const status = generation?.status;
            const ready = status === 'done';
            return (
              <Pressable
                key={id}
                accessibilityRole="button"
                accessibilityLabel={
                  ready ? `Pièce ${index + 1} — voir le visuel` : `Pièce ${index + 1}`
                }
                disabled={!ready}
                onPress={() => router.push(`/result/${id}`)}
                className={`flex-row items-center gap-3.5 rounded-2xl border border-paper3 bg-white px-3.5 py-3 ${
                  ready ? 'active:bg-paper2' : ''
                }`}
              >
                <View className="h-14 w-12 overflow-hidden rounded-xl bg-paper3">
                  {generation?.sourceImageUrl ? (
                    <Image
                      source={{ uri: generation.sourceImageUrl }}
                      className="h-full w-full"
                      resizeMode="cover"
                      accessibilityLabel={`Photo de la pièce ${index + 1}`}
                    />
                  ) : null}
                </View>
                <View className="flex-1">
                  <Text className="font-body-semibold text-sm text-ink">
                    Pièce {index + 1}
                  </Text>
                  {ready ? (
                    <Text className="mt-0.5 font-body text-xs text-gray">
                      Appuyez pour voir le visuel
                    </Text>
                  ) : null}
                </View>
                <ItemStatus status={status} />
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      {/* CTA — la galerie affiche les tuiles « en cours » du tracker global */}
      <View className="border-t border-paper3 px-5 pb-4 pt-3">
        <Button label="Voir la galerie" onPress={() => router.replace('/(tabs)/gallery')} />
      </View>
    </SafeAreaView>
  );
}
