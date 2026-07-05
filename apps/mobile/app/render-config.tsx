import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { CreditBadge } from '@/components/CreditBadge';
import { MannequinSelector } from '@/components/MannequinSelector';
import { RenderTypeSelector } from '@/components/RenderTypeSelector';
import { ScreenHeader } from '@/components/ScreenHeader';
import { isInsufficientCredits, useApi } from '@/lib/api';
import { useGenerationTracker } from '@/lib/generation-tracker';
import { t } from '@/lib/i18n';
import { formatDate, slotLabel } from '@/lib/i18n/labels';
import {
  completionSlots,
  outfitToPayload,
  outfitUploading,
} from '@/lib/outfit';
import { useRenderDraft } from '@/lib/render-draft';
import { uploadImageAsync } from '@/lib/upload';
import {
  colors,
  createGenerationRequestSchema,
  GENERATION_COST_CREDITS,
  type CreateGenerationRequest,
  type GarmentSlot,
  type GetGenerationResponse,
  type MeResponse,
} from '@vitrine/shared';

function SectionTitle({ children }: { children: string }) {
  return (
    <Text className="mb-3 font-body-bold text-[11px] uppercase tracking-[3px] text-gray2">
      {children}
    </Text>
  );
}

/** 03 — CHOISIR LE RENDU : photo · STYLE · MANNEQUIN · FOND · Générer (1 crédit). */
export default function RenderConfigScreen() {
  const router = useRouter();
  const api = useApi();
  const queryClient = useQueryClient();
  const draft = useRenderDraft();

  // Solde de crédits + préréglages boutique (GET /me).
  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get<MeResponse>('/me'),
  });

  // Fonds personnalisés réutilisables du shop (GET /backgrounds).
  const { data: backgroundsData } = useQuery({
    queryKey: ['backgrounds'],
    queryFn: () => api.backgrounds.list(),
  });
  const savedBackgrounds = backgroundsData?.backgrounds ?? [];

  // Pré-remplit STYLE / MANNEQUIN depuis les settings du shop (une seule fois par brouillon).
  useEffect(() => {
    if (me?.shop.settings && !draft.settingsApplied) {
      draft.applyShopDefaults({
        ...(me.shop.settings.defaultRenderType
          ? { defaultRenderType: me.shop.settings.defaultRenderType }
          : {}),
        ...(me.shop.settings.defaultMannequinOption
          ? { defaultMannequinOption: me.shop.settings.defaultMannequinOption }
          : {}),
        ...(me.shop.settings.defaultBackgroundOption
          ? { defaultBackgroundOption: me.shop.settings.defaultBackgroundOption }
          : {}),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, draft.settingsApplied]);

  /**
   * POST /generations : réserve 1 crédit et lance le pipeline fal.
   * Réponse 502 acceptée (génération `failed`, crédit remboursé) : on navigue
   * quand même vers l'écran 04 qui affiche l'état d'échec + remboursement.
   */
  const generateMutation = useMutation({
    mutationFn: (payload: CreateGenerationRequest) => api.generations.create(payload),
    onSuccess: ({ generation }) => {
      queryClient.setQueryData<GetGenerationResponse>(['generation', generation.id], {
        generation,
      });
      queryClient.invalidateQueries({ queryKey: ['me'] });
      // Suivi global : la génération continue même si l'écran 04 est quitté.
      // Cas 502 (génération déjà `failed`, crédit remboursé) : rien à suivre.
      if (generation.status !== 'failed') {
        useGenerationTracker.getState().track({
          id: generation.id,
          renderType: generation.renderType,
          sourceImageUrl: generation.sourceImageUrl,
        });
      }
      router.push(`/generating/${generation.id}`);
    },
    onError: (err) => {
      if (isInsufficientCredits(err)) {
        Alert.alert(
          t('renderConfig.insufficientCreditsTitle'),
          t('renderConfig.insufficientCreditsMessage', {
            credits: t('common.credits', { count: GENERATION_COST_CREDITS }),
          }),
          [
            { text: t('renderConfig.later'), style: 'cancel' },
            { text: t('renderConfig.recharge'), onPress: () => router.push('/(tabs)/credits') },
          ],
        );
        return;
      }
      Alert.alert(
        t('renderConfig.generateErrorTitle'),
        err instanceof Error ? err.message : t('renderConfig.generateErrorFallback'),
      );
    },
  });

  /** Relance l'upload de la photo source après un échec. */
  const retrySourceUpload = () => {
    const { localUri } = useRenderDraft.getState();
    if (!localUri) return;
    useRenderDraft.getState().setSourceUploading();
    uploadImageAsync(api, localUri, 'source')
      .then(({ publicUrl, objectPath }) =>
        useRenderDraft.getState().setSourceUploaded(publicUrl, objectPath),
      )
      .catch((err: unknown) =>
        useRenderDraft
          .getState()
          .setSourceUploadFailed(err instanceof Error ? err.message : t('renderConfig.uploadFailed')),
      );
  };

  /**
   * Fond personnalisé : import galerie, upload GCS (kind=background), puis
   * enregistrement POST /backgrounds pour réutilisation (best effort).
   */
  const pickCustomBackground = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.9,
    });
    const asset = result.assets?.[0];
    if (result.canceled || !asset) return;

    const store = useRenderDraft.getState();
    store.setBackgroundOption('custom');
    store.setCustomBackgroundUploading(asset.uri);
    uploadImageAsync(api, asset.uri, 'background')
      .then(async ({ publicUrl }) => {
        useRenderDraft.getState().setCustomBackgroundUploaded(publicUrl);
        // Sauvegarde du fond pour réutilisation — non bloquant pour la génération.
        try {
          await api.backgrounds.create({
            imageUrl: publicUrl,
            name: t('renderConfig.backgroundDefaultName', {
              date: formatDate(new Date()),
            }),
          });
          await queryClient.invalidateQueries({ queryKey: ['backgrounds'] });
        } catch {
          // L'enregistrement du fond réutilisable a échoué : le rendu reste possible.
        }
      })
      .catch((err: unknown) =>
        useRenderDraft
          .getState()
          .setCustomBackgroundUploadFailed(
            err instanceof Error ? err.message : t('renderConfig.uploadFailed'),
          ),
      );
  };

  const changePhoto = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/capture');
  };

  const customBackgroundReady =
    draft.backgroundOption !== 'custom' ||
    (!!draft.customBackgroundUrl && draft.customBackgroundUploadStatus === 'done');
  // La tenue ne bloque la génération que si une pièce est encore en cours d'upload.
  const outfitReady = draft.renderType !== 'model' || !outfitUploading(draft.outfit);
  const canGenerate =
    !!draft.sourceUrl &&
    draft.sourceUploadStatus === 'done' &&
    customBackgroundReady &&
    outfitReady &&
    !generateMutation.isPending;

  /** Valide le payload (contrat zod partagé) puis lance POST /generations. */
  const onGenerate = () => {
    if (!canGenerate || !draft.sourceUrl) return;
    const payload = createGenerationRequestSchema.parse({
      sourceImageUrl: draft.sourceUrl,
      renderType: draft.renderType,
      mannequinOption: draft.mannequinOption,
      ...(draft.renderType === 'model' && draft.mannequinId
        ? { mannequinId: draft.mannequinId }
        : {}),
      backgroundOption: draft.backgroundOption,
      ...(draft.backgroundOption === 'custom' && draft.customBackgroundUrl
        ? { customBackgroundUrl: draft.customBackgroundUrl }
        : {}),
      // Multi-détails (écran Angles) : vues additionnelles du même vêtement.
      ...(draft.extraImages && Object.values(draft.extraImages).some(Boolean)
        ? { extraImages: draft.extraImages }
        : {}),
      // « Compléter la tenue » (sur modèle) : type importé + pièces de complétion.
      ...(draft.renderType === 'model' ? { garmentType: draft.garmentType } : {}),
      ...(draft.renderType === 'model' && outfitToPayload(draft.outfit)
        ? { outfit: outfitToPayload(draft.outfit) }
        : {}),
    });
    draft.setPendingGeneration(payload);
    generateMutation.mutate(payload);
  };

  // Résumé de la tenue pour la carte d'entrée (pièces choisies ou consigne).
  const outfitFilled = (Object.entries(draft.outfit) as [GarmentSlot, { url: string | null }][])
    .filter(([, piece]) => piece?.url)
    .map(([slot]) => slot);
  const outfitSubtitle =
    outfitFilled.length > 0
      ? outfitFilled.map((slot) => slotLabel(slot)).join(' · ')
      : completionSlots(draft.garmentType)
          .map(
            (s) =>
              `${slotLabel(s.slot)}${
                s.required ? t('renderConfig.outfitRequiredSuffix') : t('renderConfig.outfitOptionalSuffix')
              }`,
          )
          .join(' · ');

  /** Nombre de vues additionnelles jointes (flux multi-détails). */
  const extraCount = draft.extraImages
    ? Object.values(draft.extraImages).filter(Boolean).length
    : 0;

  const generateLabel = generateMutation.isPending
    ? t('renderConfig.generating')
    : draft.sourceUploadStatus === 'uploading'
      ? t('renderConfig.sendingPhoto')
      : t('renderConfig.generateCta', {
          credits: t('common.credits', { count: GENERATION_COST_CREDITS }),
        });

  return (
    <SafeAreaView className="flex-1 bg-paper">
      <ScreenHeader
        title={t('renderConfig.title')}
        subtitle={t('renderConfig.subtitle')}
        right={<CreditBadge credits={me?.credits ?? 0} />}
      />

      <ScrollView className="flex-1 px-5" contentContainerClassName="pb-6">
        {/* Photo importée + statut d'upload + « Changer » */}
        {draft.localUri ? (
          <View className="mb-6 flex-row items-center gap-4 rounded-3xl border border-paper3 bg-paper2 p-4">
            <Image
              source={{ uri: draft.localUri }}
              className="h-28 w-24 rounded-2xl bg-paper3"
              resizeMode="cover"
              accessibilityLabel={t('renderConfig.sourcePhotoAlt')}
            />
            <View className="flex-1">
              <Text className="font-body-semibold text-sm text-ink">
                {extraCount > 0
                  ? t('renderConfig.photoImportedViews', { count: extraCount })
                  : t('renderConfig.photoImported')}
              </Text>
              {draft.sourceUploadStatus === 'uploading' ? (
                <View className="mt-1 flex-row items-center gap-2">
                  <ActivityIndicator size="small" color={colors.ink} />
                  <Text className="font-body text-xs text-gray2">{t('renderConfig.uploading')}</Text>
                </View>
              ) : draft.sourceUploadStatus === 'done' ? (
                <View className="mt-1 flex-row items-center gap-1.5">
                  <Ionicons name="checkmark-circle" size={14} color={colors.ink} />
                  <Text className="font-body text-xs text-gray2">{t('renderConfig.uploaded')}</Text>
                </View>
              ) : draft.sourceUploadStatus === 'error' ? (
                <View className="mt-1">
                  <Text className="font-body text-xs text-ink" numberOfLines={2}>
                    {`⚠️ ${draft.sourceUploadError ?? t('renderConfig.uploadFailed')}`}
                  </Text>
                  <Pressable accessibilityRole="button" onPress={retrySourceUpload}>
                    <Text className="mt-1 font-body-semibold text-xs text-ink underline">
                      {t('common.retry')}
                    </Text>
                  </Pressable>
                </View>
              ) : null}
              <Pressable
                accessibilityRole="button"
                onPress={changePhoto}
                className="mt-3 self-start rounded-full border border-ink px-4 py-1.5 active:bg-paper3"
              >
                <Text className="font-body-semibold text-xs text-ink">{t('common.change')}</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            onPress={changePhoto}
            className="mb-6 h-44 items-center justify-center rounded-3xl border border-dashed border-paper3 bg-paper2 active:bg-paper3"
          >
            <Ionicons name="camera-outline" size={28} color={colors.gray2} />
            <Text className="mt-2 font-body-semibold text-sm text-ink">{t('renderConfig.captureCta')}</Text>
            <Text className="mt-1 font-body text-xs text-gray">
              {t('renderConfig.captureHint')}
            </Text>
          </Pressable>
        )}

        {/* STYLE DE VISUEL — 4 types */}
        <SectionTitle>{t('renderConfig.styleSectionTitle')}</SectionTitle>
        <RenderTypeSelector
          value={draft.renderType}
          onChange={draft.setRenderType}
          className="mb-6"
        />

        {/* MANNEQUIN — visible pour le rendu « Sur modèle » */}
        {draft.renderType === 'model' ? (
          <>
            <SectionTitle>{t('renderConfig.mannequinSectionTitle')}</SectionTitle>
            <MannequinSelector
              value={draft.mannequinOption}
              mannequinId={draft.mannequinId}
              onChange={draft.setMannequinOption}
              onChangeMannequin={draft.setMannequinId}
              className="mb-6"
            />

            {/* COMPLÉTER LA TENUE — entrée du sous-flux d'habillage */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('renderConfig.completeOutfitLabel')}
              onPress={() => router.push('/outfit?target=single')}
              className="mb-6 flex-row items-center gap-3 rounded-2xl border border-paper3 bg-white p-3 active:bg-paper2"
            >
              <View className="h-10 w-10 items-center justify-center rounded-xl bg-paper2">
                <Ionicons name="shirt-outline" size={20} color={colors.ink} />
              </View>
              <View className="flex-1">
                <Text className="font-body-bold text-[13px] text-ink">
                  {t('renderConfig.completeOutfitLabel')}
                </Text>
                <Text className="mt-0.5 font-body text-xs text-gray">{outfitSubtitle}</Text>
              </View>
              <View className="rounded-full bg-ink px-3 py-1.5">
                <Text className="font-body-bold text-[11px] text-offwhite">
                  {outfitFilled.length > 0 ? t('common.modify') : t('common.configure')}
                </Text>
              </View>
            </Pressable>
          </>
        ) : null}

        {/* FOND — studio / personnalisé (upload) / fonds réutilisables */}
        <SectionTitle>{t('renderConfig.backgroundSectionTitle')}</SectionTitle>
        <View className="flex-row gap-3">
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: draft.backgroundOption === 'studio' }}
            onPress={() => draft.setBackgroundOption('studio')}
            className={`flex-1 rounded-2xl border px-4 py-4 ${
              draft.backgroundOption === 'studio' ? 'border-ink bg-ink' : 'border-paper3 bg-white'
            }`}
          >
            <Text
              className={`font-body-semibold text-sm ${
                draft.backgroundOption === 'studio' ? 'text-offwhite' : 'text-ink'
              }`}
            >
              {t('renderConfig.backgroundStudio')}
            </Text>
            <Text className="mt-1 font-body text-xs text-gray">{t('renderConfig.backgroundStudioHint')}</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: draft.backgroundOption === 'custom' }}
            onPress={pickCustomBackground}
            className={`flex-1 rounded-2xl border px-4 py-4 ${
              draft.backgroundOption === 'custom'
                ? 'border-ink bg-ink'
                : 'border-dashed border-paper3 bg-white'
            }`}
          >
            <View className="flex-row items-center gap-2">
              {draft.customBackgroundLocalUri ? (
                <Image
                  source={{ uri: draft.customBackgroundLocalUri }}
                  className="h-6 w-6 rounded-md bg-paper3"
                  resizeMode="cover"
                  accessibilityLabel={t('renderConfig.backgroundCustomAlt')}
                />
              ) : (
                <Ionicons
                  name="add-circle-outline"
                  size={16}
                  color={draft.backgroundOption === 'custom' ? colors.offwhite : colors.ink}
                />
              )}
              <Text
                className={`font-body-semibold text-sm ${
                  draft.backgroundOption === 'custom' ? 'text-offwhite' : 'text-ink'
                }`}
              >
                {t('renderConfig.backgroundCustom')}
              </Text>
            </View>
            {draft.customBackgroundUploadStatus === 'uploading' ? (
              <View className="mt-1 flex-row items-center gap-2">
                <ActivityIndicator
                  size="small"
                  color={draft.backgroundOption === 'custom' ? colors.offwhite : colors.ink}
                />
                <Text className="font-body text-xs text-gray">{t('renderConfig.backgroundUploading')}</Text>
              </View>
            ) : draft.customBackgroundUploadStatus === 'error' ? (
              <Text className="mt-1 font-body text-xs text-gray" numberOfLines={2}>
                {`⚠️ ${draft.customBackgroundUploadError ?? t('renderConfig.uploadFailed')} — ${t('renderConfig.retryTap')}`}
              </Text>
            ) : draft.customBackgroundUrl ? (
              <Text className="mt-1 font-body text-xs text-gray">
                {t('renderConfig.backgroundUploaded')}
              </Text>
            ) : (
              <Text className="mt-1 font-body text-xs text-gray">{t('renderConfig.backgroundCustomHint')}</Text>
            )}
          </Pressable>
        </View>

        {/* MES FONDS — vignettes réutilisables (GET /backgrounds) */}
        {savedBackgrounds.length > 0 ? (
          <View className="mt-4">
            <Text className="mb-2 font-body-semibold text-[10px] uppercase tracking-[2px] text-gray">
              {t('renderConfig.myBackgroundsTitle')}
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerClassName="gap-2.5 pr-5"
            >
              {savedBackgrounds.map((bg) => {
                const selected =
                  draft.backgroundOption === 'custom' &&
                  draft.customBackgroundUrl === bg.imageUrl;
                return (
                  <Pressable
                    key={bg.id}
                    accessibilityRole="button"
                    accessibilityLabel={t('renderConfig.backgroundLabel', { name: bg.name })}
                    accessibilityState={{ selected }}
                    onPress={() => draft.selectExistingBackground(bg.imageUrl)}
                    className={`overflow-hidden rounded-xl border-2 ${
                      selected ? 'border-ink' : 'border-paper3'
                    }`}
                  >
                    <Image
                      source={{ uri: bg.displayUrl }}
                      className="h-16 w-16 bg-paper3"
                      resizeMode="cover"
                    />
                    {selected ? (
                      <View className="absolute right-1 top-1 h-4 w-4 items-center justify-center rounded-full bg-ink">
                        <Ionicons name="checkmark" size={10} color={colors.offwhite} />
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        ) : null}
      </ScrollView>

      {/* CTA */}
      <View className="border-t border-paper3 px-5 pb-4 pt-3">
        <Button label={generateLabel} disabled={!canGenerate} onPress={onGenerate} />
      </View>
    </SafeAreaView>
  );
}
