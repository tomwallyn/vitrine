import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { CreditBadge } from '@/components/CreditBadge';
import { ScreenHeader } from '@/components/ScreenHeader';
import { isInsufficientCredits, useApi } from '@/lib/api';
import { useBatchDraft, type BatchItem } from '@/lib/batch-draft';
import { useCaptureResult } from '@/lib/capture-result';
import { useGenerationTracker } from '@/lib/generation-tracker';
import { uploadImageAsync } from '@/lib/upload';
import {
  colors,
  createBatchRequestSchema,
  MAX_BATCH_ITEMS,
  RENDER_TYPE_LABELS,
  type CreateBatchRequest,
  type MeResponse,
} from '@vitrine/shared';

/** 02c — LOT DE VÊTEMENTS : multi-import galerie + style commun + génération groupée. */
export default function BatchScreen() {
  const router = useRouter();
  const api = useApi();
  const queryClient = useQueryClient();
  const items = useBatchDraft((state) => state.items);
  const style = useBatchDraft((state) => state.style);

  // Solde de crédits (header).
  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get<MeResponse>('/me'),
  });

  /** Upload GCS d'un item du lot (kind=source) — statut suivi dans le store. */
  const uploadItem = (item: BatchItem) => {
    uploadImageAsync(api, item.localUri, 'source')
      .then(({ publicUrl }) => useBatchDraft.getState().setUploaded(item.id, publicUrl))
      .catch(() => useBatchDraft.getState().setUploadFailed(item.id));
  };

  /** Multi-sélection galerie (max 30 au total) → ajout au lot + uploads en fond. */
  const pickImages = async () => {
    const remaining = MAX_BATCH_ITEMS - useBatchDraft.getState().items.length;
    if (remaining <= 0) {
      Alert.alert('Lot complet', `Un lot contient au maximum ${MAX_BATCH_ITEMS} pièces.`);
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.9,
      allowsMultipleSelection: true,
      selectionLimit: remaining,
    });
    if (result.canceled || result.assets.length === 0) return;

    const created = useBatchDraft.getState().addItems(result.assets.map((a) => a.uri));
    created.forEach(uploadItem);
  };

  /** Appareil photo : ouvre l'écran caméra custom de l'app (identité + confirmation). */
  const addFromCamera = () => {
    const remaining = MAX_BATCH_ITEMS - useBatchDraft.getState().items.length;
    if (remaining <= 0) {
      Alert.alert('Lot complet', `Un lot contient au maximum ${MAX_BATCH_ITEMS} pièces.`);
      return;
    }
    useCaptureResult.getState().request('batch');
    router.push('/capture?mode=return');
  };

  // Retour de l'écran caméra custom → ajout de la photo au lot + upload.
  const captureUri = useCaptureResult((s) => s.uri);
  useEffect(() => {
    if (!captureUri) return;
    const res = useCaptureResult.getState().takeFor('batch');
    if (res) {
      const created = useBatchDraft.getState().addItems([res.uri]);
      created.forEach(uploadItem);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [captureUri]);

  // À l'ouverture d'un lot vide, on propose d'abord le choix du style commun :
  // l'utilisateur sait ainsi ce qui sera généré (au lieu d'un défaut caché).
  const styleOpenedRef = useRef(false);
  useEffect(() => {
    if (styleOpenedRef.current) return;
    styleOpenedRef.current = true;
    if (useBatchDraft.getState().items.length === 0) router.push('/batch-style');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Choix de la source pour ajouter des pièces : appareil photo ou galerie. */
  const addPhotos = () => {
    Alert.alert('Ajouter des vêtements', 'Comment voulez-vous ajouter vos photos ?', [
      { text: 'Appareil photo', onPress: () => void addFromCamera() },
      { text: 'Galerie', onPress: () => void pickImages() },
      { text: 'Annuler', style: 'cancel' },
    ]);
  };

  /** Réessaie l'upload d'un item en échec (même fichier). */
  const retryItem = (item: BatchItem) => {
    useBatchDraft.getState().setUploading(item.id);
    uploadItem(item);
  };

  /**
   * POST /generations/batch : pré-check global du solde (402 si insuffisant),
   * puis 1 crédit réservé par item. `sources` garde l'URL de chaque item pour
   * alimenter le tracker (les générations reviennent dans le même ordre).
   */
  const batchMutation = useMutation({
    mutationFn: ({ payload }: { payload: CreateBatchRequest; sources: string[] }) =>
      api.generations.createBatch(payload),
    onSuccess: ({ generations }, { sources }) => {
      queryClient.invalidateQueries({ queryKey: ['me'] });
      // Suivi global de chaque génération du lot (tuiles galerie + badge +
      // notifs). Les items déjà `failed` (soumission fal KO, crédit remboursé)
      // n'ont rien à suivre.
      generations.forEach((gen, index) => {
        if (gen.status === 'failed') return;
        useGenerationTracker.getState().track({
          id: gen.id,
          renderType: style.renderType,
          ...(sources[index] ? { sourceImageUrl: sources[index] } : {}),
        });
      });
      useBatchDraft.getState().reset();
      router.replace(`/batch-progress?ids=${generations.map((g) => g.id).join(',')}`);
    },
    onError: (err, { payload }) => {
      if (isInsufficientCredits(err)) {
        Alert.alert(
          'Crédits insuffisants',
          `Il faut ${payload.items.length} crédits pour générer ce lot (1 par visuel). Rechargez votre solde pour continuer.`,
          [
            { text: 'Plus tard', style: 'cancel' },
            { text: 'Recharger', onPress: () => router.push('/(tabs)/credits') },
          ],
        );
        return;
      }
      Alert.alert(
        'Génération impossible',
        err instanceof Error ? err.message : 'Réessayez dans un instant.',
      );
    },
  });

  const readyItems = items.filter((i) => i.status === 'ready' && !!i.uploadedUrl);
  const anyUploading = items.some((i) => i.status === 'uploading');
  const readyCount = readyItems.length;
  const customBackgroundReady =
    style.backgroundOption !== 'custom' || !!style.customBackgroundUrl;
  const canGenerate =
    readyCount >= 1 && !anyUploading && customBackgroundReady && !batchMutation.isPending;

  /** Valide le payload (contrat zod partagé) puis lance POST /generations/batch. */
  const onGenerate = () => {
    if (!canGenerate) return;
    const sources = readyItems.map((i) => i.uploadedUrl!);
    const payload = createBatchRequestSchema.parse({
      items: sources.map((sourceImageUrl) => ({ sourceImageUrl })),
      renderType: style.renderType,
      mannequinOption: style.mannequinOption,
      backgroundOption: style.backgroundOption,
      ...(style.backgroundOption === 'custom' && style.customBackgroundUrl
        ? { customBackgroundUrl: style.customBackgroundUrl }
        : {}),
    });
    batchMutation.mutate({ payload, sources });
  };

  const generateLabel = batchMutation.isPending
    ? 'Lancement du lot…'
    : anyUploading
      ? 'Envoi des photos…'
      : `Générer ${readyCount} visuel${readyCount > 1 ? 's' : ''} · ${readyCount} crédit${readyCount > 1 ? 's' : ''}`;

  return (
    <SafeAreaView className="flex-1 bg-paper">
      <ScreenHeader
        title={`Lot · ${items.length} pièce${items.length > 1 ? 's' : ''}`}
        right={<CreditBadge credits={me?.credits ?? 0} />}
      />

      <ScrollView className="flex-1 px-5" contentContainerClassName="pb-6">
        {/* Barre STYLE COMMUN — appliqué à tout le lot, modifiable (modal) */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Modifier le style commun du lot"
          onPress={() => router.push('/batch-style')}
          className="mt-2 flex-row items-center gap-3 rounded-3xl border border-paper3 bg-paper2 px-4 py-4 active:bg-paper3"
        >
          <View className="h-10 w-10 items-center justify-center rounded-2xl bg-white">
            <Ionicons name="color-palette-outline" size={18} color={colors.ink} />
          </View>
          <View className="flex-1">
            <Text className="font-body-bold text-sm text-ink">
              Style commun · {RENDER_TYPE_LABELS[style.renderType]}
            </Text>
            <Text className="mt-0.5 font-body text-xs text-gray2">Appliqué à tout le lot</Text>
          </View>
          <Text className="font-body-semibold text-xs text-ink underline">Modifier</Text>
        </Pressable>

        {items.length === 0 ? (
          /* Lot vide (sélection annulée) : relance la multi-sélection */
          <Pressable
            accessibilityRole="button"
            onPress={addPhotos}
            className="mt-5 h-44 items-center justify-center rounded-3xl border border-dashed border-paper3 bg-paper2 active:bg-paper3"
          >
            <Ionicons name="camera-outline" size={28} color={colors.gray2} />
            <Text className="mt-2 font-body-semibold text-sm text-ink">Ajouter des vêtements</Text>
            <Text className="mt-1 font-body text-xs text-gray">
              Appareil photo ou galerie · jusqu&apos;à {MAX_BATCH_ITEMS} pièces
            </Text>
          </Pressable>
        ) : (
          /* Grille des pièces du lot — 3 colonnes */
          <View className="mt-5 flex-row flex-wrap gap-2">
            {items.map((item) => (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                accessibilityLabel={
                  item.status === 'error'
                    ? 'Envoi impossible — appuyez pour réessayer'
                    : 'Pièce du lot'
                }
                onPress={() => {
                  if (item.status === 'error') retryItem(item);
                }}
                className="aspect-square w-[31%] overflow-hidden rounded-2xl border border-paper3 bg-paper2"
              >
                <Image
                  source={{ uri: item.localUri }}
                  className="absolute h-full w-full"
                  resizeMode="cover"
                  accessibilityLabel="Photo du vêtement"
                />

                {/* Statut d'upload : spinner / coche / réessayer */}
                {item.status === 'uploading' ? (
                  <View className="flex-1 items-center justify-center bg-ink/40">
                    <ActivityIndicator size="small" color={colors.offwhite} />
                  </View>
                ) : item.status === 'error' ? (
                  <View className="flex-1 items-center justify-center bg-ink/60 px-1.5">
                    <Ionicons name="alert-circle-outline" size={18} color={colors.offwhite} />
                    <Text className="mt-1 text-center font-body-semibold text-[10px] text-offwhite underline">
                      Réessayer
                    </Text>
                  </View>
                ) : (
                  <View className="absolute bottom-1.5 right-1.5 h-5 w-5 items-center justify-center rounded-full bg-ink">
                    <Ionicons name="checkmark" size={12} color={colors.offwhite} />
                  </View>
                )}

                {/* Croix de suppression */}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Retirer cette pièce du lot"
                  hitSlop={8}
                  onPress={() => useBatchDraft.getState().removeItem(item.id)}
                  className="absolute right-1.5 top-1.5 h-5 w-5 items-center justify-center rounded-full bg-ink/70 active:bg-ink"
                >
                  <Ionicons name="close" size={12} color={colors.offwhite} />
                </Pressable>
              </Pressable>
            ))}

            {/* Tuile « + Ajouter » — rouvre la multi-sélection (max 30) */}
            {items.length < MAX_BATCH_ITEMS ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Ajouter des photos au lot"
                onPress={addPhotos}
                className="aspect-square w-[31%] items-center justify-center gap-1.5 rounded-2xl border border-dashed border-paper3 bg-paper2 active:bg-paper3"
              >
                <Ionicons name="add" size={26} color={colors.ink} />
                <Text className="font-body-semibold text-xs text-ink">Ajouter</Text>
              </Pressable>
            ) : null}
          </View>
        )}

        {items.length > 0 ? (
          /* Bandeau — 1 crédit par pièce du lot */
          <View className="mt-5 flex-row items-center gap-2.5 rounded-2xl border border-paper3 bg-paper2 px-4 py-3">
            <Ionicons name="information-circle-outline" size={18} color={colors.gray3} />
            <Text className="flex-1 font-body text-xs leading-4 text-gray2">
              1 crédit par pièce — le style choisi s&apos;applique à tout le lot.
            </Text>
          </View>
        ) : null}
      </ScrollView>

      {/* CTA — actif si ≥ 1 pièce prête et aucun envoi en cours */}
      <View className="border-t border-paper3 px-5 pb-4 pt-3">
        <Button label={generateLabel} disabled={!canGenerate} onPress={onGenerate} />
      </View>
    </SafeAreaView>
  );
}
