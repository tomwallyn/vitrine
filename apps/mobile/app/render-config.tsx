import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { CreditBadge } from '@/components/CreditBadge';
import { MannequinSelector } from '@/components/MannequinSelector';
import { RenderTypeSelector } from '@/components/RenderTypeSelector';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useApi } from '@/lib/api';
import { useRenderDraft } from '@/lib/render-draft';
import { uploadImageAsync } from '@/lib/upload';
import {
  colors,
  createGenerationRequestSchema,
  GENERATION_COST_CREDITS,
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
  const draft = useRenderDraft();

  // Solde de crédits + préréglages boutique (GET /me).
  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get<MeResponse>('/me'),
  });

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
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, draft.settingsApplied]);

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
          .setSourceUploadFailed(err instanceof Error ? err.message : 'Envoi impossible'),
      );
  };

  /** Fond personnalisé : import galerie puis upload GCS (kind=background). */
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
      .then(({ publicUrl }) => useRenderDraft.getState().setCustomBackgroundUploaded(publicUrl))
      .catch((err: unknown) =>
        useRenderDraft
          .getState()
          .setCustomBackgroundUploadFailed(
            err instanceof Error ? err.message : 'Envoi impossible',
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
  const canGenerate =
    !!draft.sourceUrl && draft.sourceUploadStatus === 'done' && customBackgroundReady;

  /** Valide + assemble le payload de génération ; POST /generations arrive en M3. */
  const onGenerate = () => {
    if (!canGenerate || !draft.sourceUrl) return;
    const payload = createGenerationRequestSchema.parse({
      sourceImageUrl: draft.sourceUrl,
      renderType: draft.renderType,
      mannequinOption: draft.mannequinOption,
      backgroundOption: draft.backgroundOption,
      ...(draft.backgroundOption === 'custom' && draft.customBackgroundUrl
        ? { customBackgroundUrl: draft.customBackgroundUrl }
        : {}),
    });
    draft.setPendingGeneration(payload);
    // TODO(M3): POST /generations → id réel ; en attendant, id temporaire.
    router.push(`/generating/draft-${Date.now()}`);
  };

  const generateLabel =
    draft.sourceUploadStatus === 'uploading'
      ? 'Envoi de la photo…'
      : `Générer le visuel · ${GENERATION_COST_CREDITS} crédit`;

  return (
    <SafeAreaView className="flex-1 bg-paper">
      <ScreenHeader
        title="Choisir le rendu"
        subtitle="Étape 2/3"
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
              accessibilityLabel="Photo du vêtement"
            />
            <View className="flex-1">
              <Text className="font-body-semibold text-sm text-ink">Photo importée</Text>
              {draft.sourceUploadStatus === 'uploading' ? (
                <View className="mt-1 flex-row items-center gap-2">
                  <ActivityIndicator size="small" color={colors.ink} />
                  <Text className="font-body text-xs text-gray2">Envoi en cours…</Text>
                </View>
              ) : draft.sourceUploadStatus === 'done' ? (
                <View className="mt-1 flex-row items-center gap-1.5">
                  <Ionicons name="checkmark-circle" size={14} color={colors.ink} />
                  <Text className="font-body text-xs text-gray2">Photo envoyée</Text>
                </View>
              ) : draft.sourceUploadStatus === 'error' ? (
                <View className="mt-1">
                  <Text className="font-body text-xs text-ink" numberOfLines={2}>
                    ⚠️ {draft.sourceUploadError ?? 'Envoi impossible'}
                  </Text>
                  <Pressable accessibilityRole="button" onPress={retrySourceUpload}>
                    <Text className="mt-1 font-body-semibold text-xs text-ink underline">
                      Réessayer
                    </Text>
                  </Pressable>
                </View>
              ) : null}
              <Pressable
                accessibilityRole="button"
                onPress={changePhoto}
                className="mt-3 self-start rounded-full border border-ink px-4 py-1.5 active:bg-paper3"
              >
                <Text className="font-body-semibold text-xs text-ink">Changer</Text>
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
            <Text className="mt-2 font-body-semibold text-sm text-ink">Prendre une photo</Text>
            <Text className="mt-1 font-body text-xs text-gray">
              Le vêtement bien à plat, cintre centré
            </Text>
          </Pressable>
        )}

        {/* STYLE DE VISUEL — 4 types */}
        <SectionTitle>Style de visuel</SectionTitle>
        <RenderTypeSelector
          value={draft.renderType}
          onChange={draft.setRenderType}
          className="mb-6"
        />

        {/* MANNEQUIN — visible pour le rendu « Sur modèle » */}
        {draft.renderType === 'model' ? (
          <>
            <SectionTitle>Mannequin</SectionTitle>
            <MannequinSelector
              value={draft.mannequinOption}
              onChange={draft.setMannequinOption}
              className="mb-6"
            />
          </>
        ) : null}

        {/* FOND — studio / personnalisé (upload) */}
        <SectionTitle>Fond</SectionTitle>
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
              Fond studio
            </Text>
            <Text className="mt-1 font-body text-xs text-gray">Crème, neutre</Text>
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
                  accessibilityLabel="Fond personnalisé"
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
                Personnalisé
              </Text>
            </View>
            {draft.customBackgroundUploadStatus === 'uploading' ? (
              <View className="mt-1 flex-row items-center gap-2">
                <ActivityIndicator
                  size="small"
                  color={draft.backgroundOption === 'custom' ? colors.offwhite : colors.ink}
                />
                <Text className="font-body text-xs text-gray">Envoi du fond…</Text>
              </View>
            ) : draft.customBackgroundUploadStatus === 'error' ? (
              <Text className="mt-1 font-body text-xs text-gray" numberOfLines={2}>
                ⚠️ {draft.customBackgroundUploadError ?? 'Envoi impossible'} — réappuyez
              </Text>
            ) : draft.customBackgroundUrl ? (
              <Text className="mt-1 font-body text-xs text-gray">
                Fond envoyé — appuyez pour changer
              </Text>
            ) : (
              <Text className="mt-1 font-body text-xs text-gray">Votre boutique, un mur…</Text>
            )}
          </Pressable>
        </View>
      </ScrollView>

      {/* CTA */}
      <View className="border-t border-paper3 px-5 pb-4 pt-3">
        <Button label={generateLabel} disabled={!canGenerate} onPress={onGenerate} />
      </View>
    </SafeAreaView>
  );
}
