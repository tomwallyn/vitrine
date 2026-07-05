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
import { t } from '@/lib/i18n';
import { renderTypeLabel } from '@/lib/i18n/labels';
import { outfitToPayload, outfitUploading } from '@/lib/outfit';
import { sceneToPayload, sceneUploading } from '@/lib/scene';
import { uploadImageAsync } from '@/lib/upload';
import {
  colors,
  createBatchRequestSchema,
  MAX_BATCH_ITEMS,
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
  const garmentType = useBatchDraft((state) => state.garmentType);
  const outfit = useBatchDraft((state) => state.outfit);
  const scene = useBatchDraft((state) => state.scene);
  const isObjet = style.subjectType === 'objet';

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
      Alert.alert(t('batch.limitTitle'), t('batch.limitMessage', { max: MAX_BATCH_ITEMS }));
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
      Alert.alert(t('batch.limitTitle'), t('batch.limitMessage', { max: MAX_BATCH_ITEMS }));
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
    Alert.alert(
      isObjet ? t('batch.addPhotosTitleObjet') : t('batch.addPhotosTitleGarment'),
      t('batch.addPhotosMessage'),
      [
        { text: t('batch.camera'), onPress: () => void addFromCamera() },
        { text: t('batch.gallery'), onPress: () => void pickImages() },
        { text: t('common.cancel'), style: 'cancel' },
      ],
    );
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
          t('batch.insufficientCreditsTitle'),
          t('batch.insufficientCreditsMessage', { count: payload.items.length }),
          [
            { text: t('batch.later'), style: 'cancel' },
            { text: t('batch.recharge'), onPress: () => router.push('/(tabs)/credits') },
          ],
        );
        return;
      }
      Alert.alert(
        t('batch.generateErrorTitle'),
        err instanceof Error ? err.message : t('batch.generateErrorFallback'),
      );
    },
  });

  const readyItems = items.filter((i) => i.status === 'ready' && !!i.uploadedUrl);
  const anyUploading = items.some((i) => i.status === 'uploading');
  const readyCount = readyItems.length;
  const customBackgroundReady =
    style.backgroundOption !== 'custom' || !!style.customBackgroundUrl;
  const outfitReady = style.renderType !== 'model' || !outfitUploading(outfit);
  const sceneReadyGate = !isObjet || !sceneUploading(scene);
  const canGenerate =
    readyCount >= 1 &&
    !anyUploading &&
    customBackgroundReady &&
    outfitReady &&
    sceneReadyGate &&
    !batchMutation.isPending;

  /** Valide le payload (contrat zod partagé) puis lance POST /generations/batch. */
  const onGenerate = () => {
    if (!canGenerate) return;
    const sources = readyItems.map((i) => i.uploadedUrl!);
    const payload = createBatchRequestSchema.parse({
      items: sources.map((sourceImageUrl) => ({ sourceImageUrl })),
      subjectType: style.subjectType,
      renderType: style.renderType,
      ...(isObjet
        ? {
            // Objet : ambiance lumière + scène communes au lot.
            lighting: style.lighting,
            ...(sceneToPayload(scene) ? { scene: sceneToPayload(scene) } : {}),
          }
        : {
            mannequinOption: style.mannequinOption,
            ...(style.renderType === 'model' && style.mannequinId
              ? { mannequinId: style.mannequinId }
              : {}),
            backgroundOption: style.backgroundOption,
            ...(style.backgroundOption === 'custom' && style.customBackgroundUrl
              ? { customBackgroundUrl: style.customBackgroundUrl }
              : {}),
            // « Compléter la tenue » (sur modèle) : tenue commune au lot.
            ...(style.renderType === 'model' ? { garmentType } : {}),
            ...(style.renderType === 'model' && outfitToPayload(outfit)
              ? { outfit: outfitToPayload(outfit) }
              : {}),
          }),
    });
    batchMutation.mutate({ payload, sources });
  };

  const generateLabel = batchMutation.isPending
    ? t('batch.launching')
    : anyUploading
      ? t('batch.uploadingPhotos')
      : t('batch.generateCta', { count: readyCount });

  return (
    <SafeAreaView className="flex-1 bg-paper">
      <ScreenHeader
        title={
          isObjet
            ? t('batch.headerObjet', { count: items.length })
            : t('batch.headerGarment', { count: items.length })
        }
        right={<CreditBadge credits={me?.credits ?? 0} />}
      />

      <ScrollView className="flex-1 px-5" contentContainerClassName="pb-6">
        {/* Barre STYLE COMMUN — appliqué à tout le lot, modifiable (modal) */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('batch.editStyleLabel')}
          onPress={() => router.push('/batch-style')}
          className="mt-2 flex-row items-center gap-3 rounded-3xl border border-paper3 bg-paper2 px-4 py-4 active:bg-paper3"
        >
          <View className="h-10 w-10 items-center justify-center rounded-2xl bg-white">
            <Ionicons name="color-palette-outline" size={18} color={colors.ink} />
          </View>
          <View className="flex-1">
            <Text className="font-body-bold text-sm text-ink">
              {t('batch.commonStyleLabel', { renderType: renderTypeLabel(style.renderType) })}
            </Text>
            <Text className="mt-0.5 font-body text-xs text-gray2">{t('batch.appliedToBatch')}</Text>
          </View>
          <Text className="font-body-semibold text-xs text-ink underline">{t('common.modify')}</Text>
        </Pressable>

        {items.length === 0 ? (
          /* Lot vide (sélection annulée) : relance la multi-sélection */
          <Pressable
            accessibilityRole="button"
            onPress={addPhotos}
            className="mt-5 h-44 items-center justify-center rounded-3xl border border-dashed border-paper3 bg-paper2 active:bg-paper3"
          >
            <Ionicons name="camera-outline" size={28} color={colors.gray2} />
            <Text className="mt-2 font-body-semibold text-sm text-ink">
              {isObjet ? t('batch.addPhotosTitleObjet') : t('batch.addPhotosTitleGarment')}
            </Text>
            <Text className="mt-1 font-body text-xs text-gray">
              {isObjet
                ? t('batch.addPhotosSubtitleObjet', { max: MAX_BATCH_ITEMS })
                : t('batch.addPhotosSubtitleGarment', { max: MAX_BATCH_ITEMS })}
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
                    ? t('batch.uploadErrorLabel')
                    : t('batch.itemLabel')
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
                  accessibilityLabel={t('batch.itemPhotoLabel')}
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
                      {t('common.retry')}
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
                  accessibilityLabel={t('batch.removeItemLabel')}
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
                accessibilityLabel={t('batch.addPhotosLabel')}
                onPress={addPhotos}
                className="aspect-square w-[31%] items-center justify-center gap-1.5 rounded-2xl border border-dashed border-paper3 bg-paper2 active:bg-paper3"
              >
                <Ionicons name="add" size={26} color={colors.ink} />
                <Text className="font-body-semibold text-xs text-ink">{t('common.add')}</Text>
              </Pressable>
            ) : null}
          </View>
        )}

        {items.length > 0 ? (
          /* Bandeau — 1 crédit par pièce du lot */
          <View className="mt-5 flex-row items-center gap-2.5 rounded-2xl border border-paper3 bg-paper2 px-4 py-3">
            <Ionicons name="information-circle-outline" size={18} color={colors.gray3} />
            <Text className="flex-1 font-body text-xs leading-4 text-gray2">
              {t('batch.creditInfo')}
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
