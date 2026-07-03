import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { useApi } from '@/lib/api';
import { colors, type GenerationStatus } from '@vitrine/shared';

/** Cadence du polling GET /generations/:id tant que le rendu est en cours. */
const POLL_INTERVAL_MS = 1500;

/**
 * Durée minimale d'affichage de l'écran : même si le rendu finit avant,
 * on laisse l'animation (barre + 3 étapes) se dérouler ~13 s avant le résultat.
 */
const MIN_DISPLAY_MS = 13_000;

/** Cadence de rafraîchissement de la barre de progression. */
const PROGRESS_TICK_MS = 150;

const STEP_LABELS = [
  'Analyse du vêtement',
  'Mise en scène du modèle',
  'Rendu final & lumière',
] as const;

/**
 * Plafond de progression dicté par le status serveur (le backend n'expose
 * que queued/processing/done/failed) : on ne montre jamais 100 % tant que
 * le rendu n'est pas réellement terminé.
 */
function progressCap(status: GenerationStatus | undefined): number {
  if (status === 'done') return 100;
  if (status === 'processing') return 92;
  return 45; // queued / premier fetch en cours
}

/** 04 — GÉNÉRATION : polling + RENDU IA + barre de progression + 3 étapes. */
export default function GeneratingScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const api = useApi();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data, error } = useQuery({
    queryKey: ['generation', id],
    queryFn: () => api.generations.get(id!),
    enabled: !!id,
    staleTime: 0,
    // Poll tant que le rendu est en file/en cours ; stoppe sur done/failed.
    refetchInterval: (query) => {
      const status = query.state.data?.generation.status;
      return !status || status === 'queued' || status === 'processing'
        ? POLL_INTERVAL_MS
        : false;
    },
  });

  const generation = data?.generation;
  const status = generation?.status;
  const failed = status === 'failed' || !!error;
  // Bloque le retour arrière tant que l'écran est actif (y compris pendant
  // l'attente des 13 s après un rendu terminé) — sauf en cas d'échec.
  const inFlight = !failed;

  // Instant d'arrivée sur l'écran — référence de la durée minimale de 13 s.
  const startedAtRef = useRef(Date.now());

  // Progression animée : suit le temps écoulé (0 → 100 % sur ~13 s), bornée
  // par le plafond serveur (jamais 100 % tant que le rendu n'est pas fini).
  const [progress, setProgress] = useState(2);
  useEffect(() => {
    if (failed) return;
    const interval = setInterval(() => {
      setProgress((prev) => {
        const elapsed = Date.now() - startedAtRef.current;
        const timeTarget = (elapsed / MIN_DISPLAY_MS) * 100;
        const target = Math.min(timeTarget, progressCap(status));
        if (prev >= target) return prev;
        // Rattrapage borné (ex. 92 → 100 quand le rendu finit après 13 s)
        // pour éviter tout saut brutal de la barre.
        return Math.min(target, prev + 4);
      });
    }, PROGRESS_TICK_MS);
    return () => clearInterval(interval);
  }, [status, failed]);

  // status=done → écran 05, mais jamais avant MIN_DISPLAY_MS : on attend le
  // delta restant pour laisser l'animation se terminer proprement.
  useEffect(() => {
    if (status !== 'done' || !id) return;
    const elapsed = Date.now() - startedAtRef.current;
    const delay = Math.max(MIN_DISPLAY_MS - elapsed, 700);
    const timeout = setTimeout(() => router.replace(`/result/${id}`), delay);
    return () => clearTimeout(timeout);
  }, [status, id, router]);

  // Empêche le retour arrière (geste déjà désactivé dans _layout, ici le
  // bouton back Android) tant que la génération est en cours.
  const inFlightRef = useRef(inFlight);
  inFlightRef.current = inFlight;
  useEffect(() => {
    return navigation.addListener('beforeRemove', (e) => {
      if (inFlightRef.current) e.preventDefault();
    });
  }, [navigation]);

  /** Échec → retour à l'écran 03 (le brouillon de rendu est conservé). */
  const retry = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/render-config');
  };

  if (failed) {
    return (
      <SafeAreaView className="flex-1 bg-paper">
        <View className="flex-1 items-center justify-center px-8">
          <View className="h-16 w-16 items-center justify-center rounded-full border border-paper3 bg-paper2">
            <Ionicons name="alert" size={28} color={colors.ink} />
          </View>
          <Text className="mt-6 text-center font-heading-bold text-2xl text-ink">
            La génération a échoué
          </Text>
          <Text className="mt-3 text-center font-body text-sm text-gray2">
            Ton crédit a été remboursé automatiquement. Reprends la configuration et relance le
            rendu.
          </Text>
          {generation?.error ? (
            <Text className="mt-2 text-center font-body text-xs text-gray" numberOfLines={3}>
              {generation.error}
            </Text>
          ) : null}
        </View>
        <View className="px-6 pb-6">
          <Button label="Réessayer" onPress={retry} />
        </View>
      </SafeAreaView>
    );
  }

  // Étapes calées sur la barre (~13 s) : tout coché seulement en fin de course.
  const activeIndex = progress >= 99.5 ? STEP_LABELS.length : progress < 33 ? 0 : progress < 72 ? 1 : 2;

  return (
    <SafeAreaView className="flex-1 bg-paper">
      <View className="flex-1 items-center justify-center px-8">
        {/* Anneau RENDU IA + pourcentage */}
        <View className="h-[150px] w-[150px] items-center justify-center rounded-full border-[6px] border-paper3">
          <Text className="font-heading-bold text-4xl text-ink">{Math.round(progress)}%</Text>
          <Text className="mt-1 font-heading text-[10px] uppercase tracking-[2px] text-gray">
            Rendu IA
          </Text>
        </View>

        <Text className="mt-9 text-center font-heading-bold text-[22px] text-ink">
          Génération en cours…
        </Text>

        {/* Barre de progression */}
        <View className="mt-7 h-1.5 w-full overflow-hidden rounded-full bg-paper3">
          <View className="h-full rounded-full bg-ink" style={{ width: `${progress}%` }} />
        </View>

        {/* 3 étapes — l'avancement suit le status queued/processing/done */}
        <View className="mt-8 w-full gap-3.5">
          {STEP_LABELS.map((label, index) => {
            const state =
              index < activeIndex ? 'done' : index === activeIndex ? 'active' : 'pending';
            return (
              <View key={label} className="flex-row items-center gap-3">
                {state === 'done' ? (
                  <View className="h-6 w-6 items-center justify-center rounded-full bg-ink">
                    <Ionicons name="checkmark" size={14} color={colors.offwhite} />
                  </View>
                ) : state === 'active' ? (
                  <View className="h-6 w-6 items-center justify-center rounded-full border-2 border-ink">
                    <View className="h-2 w-2 rounded-full bg-ink" />
                  </View>
                ) : (
                  <View className="h-6 w-6 rounded-full border border-paper3 bg-paper2" />
                )}
                <Text
                  className={`font-body-semibold text-sm ${
                    state === 'pending' ? 'text-gray' : 'text-ink'
                  }`}
                >
                  {label}
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      <View className="items-center pb-9">
        <Text className="font-body-medium text-xs text-gray">Temps estimé · ~15 secondes</Text>
      </View>
    </SafeAreaView>
  );
}
