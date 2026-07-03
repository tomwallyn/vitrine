import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { CreditBadge } from '@/components/CreditBadge';
import { ScreenHeader } from '@/components/ScreenHeader';
import { isInsufficientCredits, useApi } from '@/lib/api';
import { useResultExport } from '@/lib/export';
import {
  colors,
  GENERATION_COST_CREDITS,
  RENDER_TYPE_LABELS,
  RENDER_TYPES,
  type Generation,
  type GetGenerationResponse,
  type MeResponse,
  type RenderType,
} from '@vitrine/shared';

const MANNEQUIN_LABELS: Record<Generation['mannequinOption'], string> = {
  femme: 'Femme',
  homme: 'Homme',
  silhouette: 'Silhouette',
  studio: 'Studio',
};

/** « Sur modèle · Femme · Fond studio » — récap de la configuration du rendu. */
function configSummary(generation: Generation): string {
  const parts = [RENDER_TYPE_LABELS[generation.renderType]];
  if (generation.renderType === 'model') {
    parts.push(MANNEQUIN_LABELS[generation.mannequinOption]);
  }
  parts.push(generation.backgroundOption === 'custom' ? 'Fond personnalisé' : 'Fond studio');
  return parts.join(' · ');
}

type ActionChipProps = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
};

function ActionChip({ icon, label, onPress, disabled = false, busy = false }: ActionChipProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled || busy}
      className={`flex-1 items-center gap-1.5 rounded-2xl border border-paper3 bg-white py-3.5 active:bg-paper2 ${
        disabled ? 'opacity-40' : ''
      }`}
    >
      {busy ? (
        <ActivityIndicator size="small" color={colors.ink} />
      ) : (
        <Ionicons name={icon} size={18} color={colors.ink} />
      )}
      <Text className="font-body-semibold text-xs text-ink">{label}</Text>
    </Pressable>
  );
}

/** 05 — RÉSULTAT : comparateur AVANT/APRÈS + Régénérer/Variantes/Exporter + galerie. */
export default function ResultScreen() {
  const router = useRouter();
  const api = useApi();
  const queryClient = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [variantsOpen, setVariantsOpen] = useState(false);
  const [selectedVariants, setSelectedVariants] = useState<RenderType[]>([]);

  // Bottom-sheet « Variantes » : fermable au swipe vers le bas + tap overlay.
  const insets = useSafeAreaInsets();
  const sheetOffset = useSharedValue(0);
  const closeVariants = () => setVariantsOpen(false);
  const openVariants = () => {
    sheetOffset.value = 0;
    setVariantsOpen(true);
  };
  const sheetPan = Gesture.Pan()
    .activeOffsetY(12)
    .onChange((event) => {
      sheetOffset.value = Math.max(0, event.translationY);
    })
    .onEnd((event) => {
      if (event.translationY > 110 || event.velocityY > 900) {
        runOnJS(closeVariants)();
      } else {
        sheetOffset.value = withSpring(0, { damping: 22, stiffness: 260 });
      }
    });
  const sheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetOffset.value }],
  }));

  const { data, isPending, error } = useQuery({
    queryKey: ['generation', id],
    queryFn: () => api.generations.get(id!),
    enabled: !!id,
  });
  const generation = data?.generation;

  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get<MeResponse>('/me'),
  });

  // Export & filigrane : « VITRINE » apposé avant partage/enregistrement
  // quand le réglage boutique est actif (défaut : actif).
  const watermarkEnabled = me?.shop.settings.watermark ?? true;
  const { share, saveToPhotos, exporting, watermarkOverlay } =
    useResultExport(watermarkEnabled);

  const creditError = (err: unknown, fallbackTitle: string) => {
    if (isInsufficientCredits(err)) {
      Alert.alert('Crédits insuffisants', 'Rechargez votre solde pour continuer.', [
        { text: 'Plus tard', style: 'cancel' },
        { text: 'Recharger', onPress: () => router.push('/(tabs)/credits') },
      ]);
      return;
    }
    Alert.alert(fallbackTitle, err instanceof Error ? err.message : 'Réessayez dans un instant.');
  };

  /** ↻ Régénérer — mêmes paramètres, nouvelle génération (1 crédit). */
  const regenerateMutation = useMutation({
    mutationFn: () => api.generations.regenerate(id!),
    onSuccess: ({ generation: next }) => {
      queryClient.setQueryData<GetGenerationResponse>(['generation', next.id], {
        generation: next,
      });
      queryClient.invalidateQueries({ queryKey: ['me'] });
      router.replace(`/generating/${next.id}`);
    },
    onError: (err) => creditError(err, 'Régénération impossible'),
  });

  /** ⊞ Variantes — autres types de rendu (1 crédit par variante). */
  const variantsMutation = useMutation({
    mutationFn: (renderTypes: RenderType[]) =>
      api.generations.createVariants(id!, { renderTypes }),
    onSuccess: ({ generations }) => {
      setVariantsOpen(false);
      setSelectedVariants([]);
      generations.forEach((g) =>
        queryClient.setQueryData<GetGenerationResponse>(['generation', g.id], { generation: g }),
      );
      queryClient.invalidateQueries({ queryKey: ['me'] });
      // On suit la première variante ; les autres tournent en parallèle et
      // seront visibles dans la galerie (M5).
      const first = generations[0];
      if (first) router.replace(`/generating/${first.id}`);
    },
    onError: (err) => creditError(err, 'Variantes impossibles'),
  });

  /** ↓ Exporter — partage ou enregistrement (filigrane selon settings.watermark). */
  const onExport = (source: Generation) => {
    Alert.alert('Exporter le visuel', 'Choisissez une destination.', [
      { text: 'Partager…', onPress: () => void share(source) },
      { text: 'Enregistrer dans Photos', onPress: () => void saveToPhotos(source) },
      { text: 'Annuler', style: 'cancel' },
    ]);
  };

  /**
   * CTA « Ajouter à ma galerie » — POST /gallery (titre par défaut dérivé
   * côté API, idempotent), puis invalidation du cache galerie (écran 06).
   */
  const galleryMutation = useMutation({
    mutationFn: () => api.gallery.add({ generationId: id! }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gallery'] });
    },
    onError: (err) =>
      Alert.alert(
        'Ajout impossible',
        err instanceof Error ? err.message : 'Réessayez dans un instant.',
      ),
  });
  const savedToGallery = galleryMutation.isSuccess;

  const toggleVariant = (renderType: RenderType) => {
    setSelectedVariants((prev) =>
      prev.includes(renderType)
        ? prev.filter((t) => t !== renderType)
        : [...prev, renderType],
    );
  };

  // ── États de garde ──────────────────────────────────────────────
  if (!id) return <Redirect href="/(tabs)" />;

  if (isPending) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-paper">
        <ActivityIndicator size="large" color={colors.ink} />
      </SafeAreaView>
    );
  }

  if (error || !generation) {
    return (
      <SafeAreaView className="flex-1 bg-paper">
        <ScreenHeader title="Résultat" />
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-center font-heading-bold text-xl text-ink">
            Résultat introuvable
          </Text>
          <Text className="mt-2 text-center font-body text-sm text-gray2">
            {error instanceof Error ? error.message : 'Cette génération est inaccessible.'}
          </Text>
        </View>
        <View className="px-6 pb-6">
          <Button label="Retour" onPress={() => router.replace('/(tabs)')} />
        </View>
      </SafeAreaView>
    );
  }

  // Génération encore en cours (ou échouée) → écran 04, qui gère ces états.
  if (generation.status !== 'done') {
    return <Redirect href={`/generating/${generation.id}`} />;
  }

  const otherRenderTypes = RENDER_TYPES.filter((t) => t !== generation.renderType);
  const variantsCost = selectedVariants.length * GENERATION_COST_CREDITS;

  return (
    <SafeAreaView className="flex-1 bg-paper">
      <ScreenHeader
        title="Résultat"
        subtitle="Étape 3/3"
        right={<CreditBadge credits={me?.credits ?? 0} />}
      />

      <ScrollView className="flex-1 px-5" contentContainerClassName="pb-6">
        {/* Comparateur — APRÈS plein cadre + vignette AVANT (maquette 05) */}
        <View className="relative aspect-[3/4] overflow-hidden rounded-3xl border border-paper3 bg-paper2">
          {generation.resultImageUrl ? (
            <Image
              source={{ uri: generation.resultImageUrl }}
              className="absolute inset-0 h-full w-full"
              resizeMode="cover"
              accessibilityLabel="Rendu IA"
            />
          ) : (
            <View className="absolute inset-0 items-center justify-center">
              <Text className="font-body text-sm text-gray">Rendu indisponible</Text>
            </View>
          )}
          <Badge label="Après · Rendu IA" className="absolute left-3 top-3" />

          {/* Vignette AVANT (photo source) */}
          <View className="absolute bottom-3 right-3 h-[98px] w-[74px] overflow-hidden rounded-xl border-2 border-white bg-paper3 shadow-lg">
            <Image
              source={{ uri: generation.sourceImageUrl }}
              className="h-full w-full"
              resizeMode="cover"
              accessibilityLabel="Photo avant"
            />
            <View className="absolute bottom-0 left-0 right-0 items-center bg-ink/60 py-0.5">
              <Text className="font-heading text-[8px] uppercase tracking-[1px] text-white">
                Avant
              </Text>
            </View>
          </View>
        </View>

        <Text className="mt-4 text-center font-body text-xs text-gray">
          {configSummary(generation)}
        </Text>

        {/* Actions secondaires : ↻ Régénérer · ⊞ Variantes · ↓ Exporter */}
        <View className="mt-6 flex-row gap-3">
          <ActionChip
            icon="refresh"
            label="Régénérer"
            busy={regenerateMutation.isPending}
            onPress={() => regenerateMutation.mutate()}
          />
          <ActionChip icon="albums-outline" label="Variantes" onPress={openVariants} />
          <ActionChip
            icon="download-outline"
            label="Exporter"
            busy={exporting}
            disabled={!generation.resultImageUrl}
            onPress={() => onExport(generation)}
          />
        </View>
      </ScrollView>

      {/* CTA principal — POST /gallery (« Ajouté ✓ » une fois enregistré) */}
      <View className="border-t border-paper3 px-5 pb-4 pt-3">
        <Button
          label={
            savedToGallery
              ? 'Ajouté ✓'
              : galleryMutation.isPending
                ? 'Ajout…'
                : 'Ajouter à ma galerie'
          }
          disabled={savedToGallery || galleryMutation.isPending}
          onPress={() => galleryMutation.mutate()}
        />
      </View>

      {/* Vue offscreen du filigrane (capturée par react-native-view-shot) */}
      {watermarkOverlay}

      {/* Sélecteur de variantes (autres types de rendu) */}
      <Modal
        visible={variantsOpen}
        transparent
        animationType="slide"
        onRequestClose={closeVariants}
      >
        {/* GestureHandlerRootView requis dans un Modal natif (Android). */}
        <GestureHandlerRootView style={{ flex: 1 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Fermer"
            className="flex-1 justify-end bg-ink/40"
            onPress={closeVariants}
          >
            <GestureDetector gesture={sheetPan}>
              <Animated.View style={sheetAnimatedStyle}>
                <Pressable
                  className="rounded-t-3xl bg-paper px-5 pt-5"
                  style={{ paddingBottom: Math.max(insets.bottom, 24) + 8 }}
                  onPress={() => {}}
                >
                  <View className="mb-4 h-1 w-10 self-center rounded-full bg-paper3" />
                  <Text className="font-heading-bold text-lg text-ink">Variantes</Text>
                  <Text className="mt-1 font-body text-xs text-gray2">
                    Générez le même vêtement sous d&apos;autres styles · {GENERATION_COST_CREDITS}{' '}
                    crédit par variante
                  </Text>

                  <View className="mt-4 gap-2.5">
                    {otherRenderTypes.map((renderType) => {
                      const selected = selectedVariants.includes(renderType);
                      return (
                        <Pressable
                          key={renderType}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: selected }}
                          onPress={() => toggleVariant(renderType)}
                          className={`flex-row items-center justify-between rounded-2xl border px-4 py-3.5 ${
                            selected ? 'border-ink bg-ink' : 'border-paper3 bg-white'
                          }`}
                        >
                          <Text
                            className={`font-body-semibold text-sm ${
                              selected ? 'text-offwhite' : 'text-ink'
                            }`}
                          >
                            {RENDER_TYPE_LABELS[renderType]}
                          </Text>
                          <Ionicons
                            name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                            size={20}
                            color={selected ? colors.offwhite : colors.gray}
                          />
                        </Pressable>
                      );
                    })}
                  </View>

                  <Button
                    className="mt-5"
                    label={
                      variantsMutation.isPending
                        ? 'Lancement des variantes…'
                        : selectedVariants.length > 0
                          ? `Générer ${selectedVariants.length} variante${selectedVariants.length > 1 ? 's' : ''} · ${variantsCost} crédit${variantsCost > 1 ? 's' : ''}`
                          : 'Sélectionnez un style'
                    }
                    disabled={selectedVariants.length === 0 || variantsMutation.isPending}
                    onPress={() => variantsMutation.mutate(selectedVariants)}
                  />
                </Pressable>
              </Animated.View>
            </GestureDetector>
          </Pressable>
        </GestureHandlerRootView>
      </Modal>
    </SafeAreaView>
  );
}
