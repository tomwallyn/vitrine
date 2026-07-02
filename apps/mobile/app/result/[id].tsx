import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
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
import { SafeAreaView } from 'react-native-safe-area-context';

import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { CreditBadge } from '@/components/CreditBadge';
import { ScreenHeader } from '@/components/ScreenHeader';
import { isInsufficientCredits, useApi } from '@/lib/api';
import {
  colors,
  GENERATION_COST_CREDITS,
  RENDER_TYPES,
  type Generation,
  type GetGenerationResponse,
  type MeResponse,
  type RenderType,
} from '@vitrine/shared';

const RENDER_TYPE_LABELS: Record<RenderType, string> = {
  model: 'Sur modèle',
  hanger: 'Sur cintre',
  folded: 'Plié à plat',
  studio: 'Fond studio',
};

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
  const [exporting, setExporting] = useState(false);
  const [savedToGallery, setSavedToGallery] = useState(false);

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

  /** Télécharge le rendu dans le cache local (préalable au partage/enregistrement). */
  const downloadResult = async (source: Generation): Promise<string> => {
    if (!source.resultImageUrl) throw new Error('Rendu indisponible');
    const target = `${FileSystem.cacheDirectory}vitrine-${source.id}.jpg`;
    const download = await FileSystem.downloadAsync(source.resultImageUrl, target);
    if (download.status !== 200) {
      throw new Error(`Téléchargement du rendu impossible (${download.status})`);
    }
    return download.uri;
  };

  const shareResult = async (source: Generation) => {
    setExporting(true);
    try {
      const uri = await downloadResult(source);
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert('Partage indisponible', "Le partage n'est pas disponible sur cet appareil.");
        return;
      }
      await Sharing.shareAsync(uri, {
        mimeType: 'image/jpeg',
        dialogTitle: 'Exporter le visuel',
      });
    } catch (err) {
      Alert.alert(
        'Export impossible',
        err instanceof Error ? err.message : 'Réessayez dans un instant.',
      );
    } finally {
      setExporting(false);
    }
  };

  const saveResultToPhotos = async (source: Generation) => {
    setExporting(true);
    try {
      const permission = await MediaLibrary.requestPermissionsAsync(true);
      if (!permission.granted) {
        Alert.alert(
          'Accès refusé',
          "Autorisez l'accès aux photos dans les réglages pour enregistrer vos visuels.",
        );
        return;
      }
      const uri = await downloadResult(source);
      await MediaLibrary.saveToLibraryAsync(uri);
      Alert.alert('Enregistré', 'Le visuel a été ajouté à votre photothèque.');
    } catch (err) {
      Alert.alert(
        'Enregistrement impossible',
        err instanceof Error ? err.message : 'Réessayez dans un instant.',
      );
    } finally {
      setExporting(false);
    }
  };

  /** ↓ Exporter — partage ou enregistrement dans la photothèque. */
  const onExport = (source: Generation) => {
    Alert.alert('Exporter le visuel', 'Choisissez une destination.', [
      { text: 'Partager…', onPress: () => void shareResult(source) },
      { text: 'Enregistrer dans Photos', onPress: () => void saveResultToPhotos(source) },
      { text: 'Annuler', style: 'cancel' },
    ]);
  };

  /**
   * CTA « Ajouter à ma galerie » — stub optimiste.
   * TODO(M5): POST /gallery { generationId, title } puis invalidation de la
   * query ['gallery'] ; l'endpoint galerie est livré au jalon M5.
   */
  const addToGallery = () => {
    setSavedToGallery(true);
  };

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
          <ActionChip
            icon="albums-outline"
            label="Variantes"
            onPress={() => setVariantsOpen(true)}
          />
          <ActionChip
            icon="download-outline"
            label="Exporter"
            busy={exporting}
            disabled={!generation.resultImageUrl}
            onPress={() => onExport(generation)}
          />
        </View>
      </ScrollView>

      {/* CTA principal — stub M5 (voir addToGallery) */}
      <View className="border-t border-paper3 px-5 pb-4 pt-3">
        <Button
          label={savedToGallery ? 'Enregistré ✓' : 'Ajouter à ma galerie'}
          disabled={savedToGallery}
          onPress={addToGallery}
        />
      </View>

      {/* Sélecteur de variantes (autres types de rendu) */}
      <Modal
        visible={variantsOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setVariantsOpen(false)}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Fermer"
          className="flex-1 justify-end bg-ink/40"
          onPress={() => setVariantsOpen(false)}
        >
          <Pressable className="rounded-t-3xl bg-paper px-5 pb-8 pt-5" onPress={() => {}}>
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
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
