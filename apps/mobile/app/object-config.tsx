import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { CreditBadge } from '@/components/CreditBadge';
import { ObjectRenderTypeSelector } from '@/components/ObjectRenderTypeSelector';
import { ScreenHeader } from '@/components/ScreenHeader';
import { isInsufficientCredits, useApi } from '@/lib/api';
import { useGenerationTracker } from '@/lib/generation-tracker';
import { useRenderDraft } from '@/lib/render-draft';
import { sceneToPayload, sceneUploading } from '@/lib/scene';
import { uploadImageAsync } from '@/lib/upload';
import {
  colors,
  createGenerationRequestSchema,
  GENERATION_COST_CREDITS,
  OBJECT_ACCESSORIES,
  OBJECT_SCENES,
  OBJECT_SURFACES,
  SCENE_LIGHTINGS,
  type CreateGenerationRequest,
  type GetGenerationResponse,
  type MeResponse,
  type ObjectRenderType,
  type SceneLighting,
} from '@vitrine/shared';

const LIGHTING_LABELS: Record<SceneLighting, string> = {
  douce: 'Douce',
  doree: 'Dorée',
  contrastee: 'Contrastée',
};

function SectionTitle({ children }: { children: string }) {
  return (
    <Text className="mb-3 font-body-bold text-[11px] uppercase tracking-[3px] text-gray2">
      {children}
    </Text>
  );
}

const presetName = (list: { key: string; name: string }[], key?: string | null) =>
  list.find((p) => p.key === key)?.name;

/** OBJET·1 — RENDU : type de rendu objet + ambiance lumière + compléter la scène. */
export default function ObjectConfigScreen() {
  const router = useRouter();
  const api = useApi();
  const queryClient = useQueryClient();
  const draft = useRenderDraft();

  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => api.get<MeResponse>('/me') });

  const generateMutation = useMutation({
    mutationFn: (payload: CreateGenerationRequest) => api.generations.create(payload),
    onSuccess: ({ generation }) => {
      queryClient.setQueryData<GetGenerationResponse>(['generation', generation.id], { generation });
      queryClient.invalidateQueries({ queryKey: ['me'] });
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
          'Crédits insuffisants',
          `Il faut ${GENERATION_COST_CREDITS} crédit pour générer un visuel. Rechargez votre solde pour continuer.`,
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

  const changePhoto = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/capture');
  };

  const canGenerate =
    !!draft.sourceUrl &&
    draft.sourceUploadStatus === 'done' &&
    !sceneUploading(draft.scene) &&
    !generateMutation.isPending;

  const onGenerate = () => {
    if (!canGenerate || !draft.sourceUrl) return;
    const payload = createGenerationRequestSchema.parse({
      sourceImageUrl: draft.sourceUrl,
      subjectType: 'objet',
      renderType: draft.renderType,
      lighting: draft.lighting,
      ...(sceneToPayload(draft.scene) ? { scene: sceneToPayload(draft.scene) } : {}),
    });
    draft.setPendingGeneration(payload);
    generateMutation.mutate(payload);
  };

  // Résumé de la scène pour la carte d'entrée.
  const sceneParts = [
    draft.scene.decor?.url ? 'Décor perso' : presetName(OBJECT_SCENES, draft.scene.background),
    presetName(OBJECT_SURFACES, draft.scene.surface),
    presetName(OBJECT_ACCESSORIES, draft.scene.accessoires),
  ].filter(Boolean);
  const sceneSubtitle = sceneParts.length > 0 ? sceneParts.join(' · ') : 'Surface, arrière-plan, accessoires';

  const generateLabel = generateMutation.isPending
    ? 'Lancement du rendu…'
    : draft.sourceUploadStatus === 'uploading'
      ? 'Envoi de la photo…'
      : `Générer le visuel · ${GENERATION_COST_CREDITS} crédit`;

  return (
    <SafeAreaView className="flex-1 bg-paper">
      <ScreenHeader title="Rendu · Objet" right={<CreditBadge credits={me?.credits ?? 0} />} />

      <ScrollView className="flex-1 px-5" contentContainerClassName="pb-6">
        {/* Photo importée */}
        {draft.localUri ? (
          <View className="mb-6 flex-row items-center gap-4 rounded-3xl border border-paper3 bg-paper2 p-4">
            <Image
              source={{ uri: draft.localUri }}
              className="h-28 w-24 rounded-2xl bg-paper3"
              resizeMode="cover"
              accessibilityLabel="Photo de l'objet"
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
        ) : null}

        {/* TYPE DE RENDU */}
        <SectionTitle>Type de rendu</SectionTitle>
        <ObjectRenderTypeSelector
          value={draft.renderType as ObjectRenderType}
          onChange={draft.setRenderType}
          className="mb-6"
        />

        {/* AMBIANCE LUMIÈRE */}
        <SectionTitle>Ambiance lumière</SectionTitle>
        <View className="mb-6 flex-row gap-2">
          {SCENE_LIGHTINGS.map((l) => {
            const selected = draft.lighting === l;
            return (
              <Pressable
                key={l}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => draft.setLighting(l)}
                className={`flex-1 items-center rounded-full border py-2.5 ${
                  selected ? 'border-ink bg-ink' : 'border-paper3 bg-white'
                }`}
              >
                <Text
                  className={`font-body-semibold text-[13px] ${
                    selected ? 'text-offwhite' : 'text-ink'
                  }`}
                >
                  {LIGHTING_LABELS[l]}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* COMPLÉTER LA SCÈNE */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Compléter la scène"
          onPress={() => router.push('/scene')}
          className="flex-row items-center gap-3 rounded-2xl border border-paper3 bg-white p-3 active:bg-paper2"
        >
          <View className="h-10 w-10 items-center justify-center rounded-xl bg-paper2">
            <Ionicons name="cube-outline" size={20} color={colors.ink} />
          </View>
          <View className="flex-1">
            <Text className="font-body-bold text-[13px] text-ink">Compléter la scène</Text>
            <Text className="mt-0.5 font-body text-xs text-gray" numberOfLines={1}>
              {sceneSubtitle}
            </Text>
          </View>
          <View className="rounded-full bg-ink px-3 py-1.5">
            <Text className="font-body-bold text-[11px] text-offwhite">
              {sceneParts.length > 0 ? 'Modifier' : 'Configurer'}
            </Text>
          </View>
        </Pressable>
      </ScrollView>

      <View className="border-t border-paper3 px-5 pb-4 pt-3">
        <Button label={generateLabel} onPress={onGenerate} disabled={!canGenerate} />
      </View>
    </SafeAreaView>
  );
}
