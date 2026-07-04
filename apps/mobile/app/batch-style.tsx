import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { MannequinSelector } from '@/components/MannequinSelector';
import { ObjectRenderTypeSelector } from '@/components/ObjectRenderTypeSelector';
import { RenderTypeSelector } from '@/components/RenderTypeSelector';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useApi } from '@/lib/api';
import { useBatchDraft } from '@/lib/batch-draft';
import { completionSlots, SLOT_LABEL } from '@/lib/outfit';
import { uploadImageAsync } from '@/lib/upload';
import {
  colors,
  OBJECT_ACCESSORIES,
  OBJECT_SCENES,
  OBJECT_SURFACES,
  SCENE_LIGHTINGS,
  type GarmentSlot,
  type ObjectRenderType,
  type SceneLighting,
} from '@vitrine/shared';

const LIGHTING_LABELS: Record<SceneLighting, string> = {
  douce: 'Douce',
  doree: 'Dorée',
  contrastee: 'Contrastée',
};

const presetName = (list: { key: string; name: string }[], key?: string | null) =>
  list.find((p) => p.key === key)?.name;

function SectionTitle({ children }: { children: string }) {
  return (
    <Text className="mb-3 font-body-bold text-[11px] uppercase tracking-[3px] text-gray2">
      {children}
    </Text>
  );
}

/** État local de l'upload d'un fond personnalisé (modal style du lot). */
type CustomBackgroundUpload = {
  localUri: string | null;
  status: 'idle' | 'uploading' | 'done' | 'error';
};

/** 02c-bis — STYLE COMMUN DU LOT : rendu · mannequin · fond, appliqués à tout le lot. */
export default function BatchStyleScreen() {
  const router = useRouter();
  const api = useApi();
  const queryClient = useQueryClient();
  const style = useBatchDraft((state) => state.style);
  const setStyle = useBatchDraft((state) => state.setStyle);
  const garmentType = useBatchDraft((state) => state.garmentType);
  const outfit = useBatchDraft((state) => state.outfit);
  const scene = useBatchDraft((state) => state.scene);

  // Résumé de la scène commune (rendu objet) pour la carte d'entrée (preset OU texte libre).
  const sceneParts = [
    scene.decor?.url
      ? 'Décor perso'
      : (presetName(OBJECT_SCENES, scene.background) ?? scene.background),
    presetName(OBJECT_SURFACES, scene.surface) ?? scene.surface,
    presetName(OBJECT_ACCESSORIES, scene.accessoires) ?? scene.accessoires,
  ].filter(Boolean);
  const sceneSubtitle =
    sceneParts.length > 0 ? sceneParts.join(' · ') : 'Surface, arrière-plan, accessoires';

  const [customUpload, setCustomUpload] = useState<CustomBackgroundUpload>({
    localUri: null,
    status: 'idle',
  });

  // Fonds personnalisés réutilisables du shop (GET /backgrounds).
  const { data: backgroundsData } = useQuery({
    queryKey: ['backgrounds'],
    queryFn: () => api.backgrounds.list(),
  });
  const savedBackgrounds = backgroundsData?.backgrounds ?? [];

  /**
   * Fond personnalisé : import galerie + upload GCS (kind=background). Le
   * style du lot ne passe en `custom` qu'une fois l'URL obtenue — le CTA du
   * lot n'est donc jamais bloqué par un fond fantôme.
   */
  const pickCustomBackground = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.9,
    });
    const asset = result.assets?.[0];
    if (result.canceled || !asset) return;

    setCustomUpload({ localUri: asset.uri, status: 'uploading' });
    uploadImageAsync(api, asset.uri, 'background')
      .then(async ({ publicUrl }) => {
        setCustomUpload({ localUri: asset.uri, status: 'done' });
        useBatchDraft.getState().setStyle({
          backgroundOption: 'custom',
          customBackgroundUrl: publicUrl,
        });
        // Sauvegarde du fond pour réutilisation — non bloquant.
        try {
          await api.backgrounds.create({
            imageUrl: publicUrl,
            name: `Fond du ${new Date().toLocaleDateString('fr-FR')}`,
          });
          await queryClient.invalidateQueries({ queryKey: ['backgrounds'] });
        } catch {
          // L'enregistrement du fond réutilisable a échoué : le lot reste possible.
        }
      })
      .catch(() => setCustomUpload({ localUri: asset.uri, status: 'error' }));
  };

  const customSelected = style.backgroundOption === 'custom';

  // Résumé de la tenue commune pour la carte d'entrée.
  const outfitFilled = (Object.entries(outfit) as [GarmentSlot, { url: string | null }][])
    .filter(([, piece]) => piece?.url)
    .map(([slot]) => slot);
  const outfitSubtitle =
    outfitFilled.length > 0
      ? outfitFilled.map((slot) => SLOT_LABEL[slot]).join(' · ')
      : completionSlots(garmentType)
          .map((s) => `${SLOT_LABEL[s.slot]}${s.required ? ' requis' : ' en option'}`)
          .join(' · ');

  return (
    <SafeAreaView className="flex-1 bg-paper">
      <ScreenHeader title="Style commun" subtitle="Appliqué à tout le lot" />

      <ScrollView className="flex-1 px-5" contentContainerClassName="pb-6">
        {style.subjectType === 'objet' ? (
          <>
            {/* TYPE DE RENDU objet — 6 types */}
            <SectionTitle>Type de rendu</SectionTitle>
            <ObjectRenderTypeSelector
              value={style.renderType as ObjectRenderType}
              onChange={(renderType) => setStyle({ renderType })}
              className="mb-6"
            />

            {/* AMBIANCE LUMIÈRE commune */}
            <SectionTitle>Ambiance lumière</SectionTitle>
            <View className="mb-6 flex-row gap-2">
              {SCENE_LIGHTINGS.map((l) => {
                const selected = style.lighting === l;
                return (
                  <Pressable
                    key={l}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => setStyle({ lighting: l })}
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

            {/* COMPLÉTER LA SCÈNE — scène commune au lot */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Compléter la scène"
              onPress={() => router.push('/scene?target=batch')}
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
          </>
        ) : (
          <>
            {/* STYLE DE VISUEL — 4 types */}
            <SectionTitle>Style de visuel</SectionTitle>
            <RenderTypeSelector
              value={style.renderType}
              onChange={(renderType) => setStyle({ renderType })}
              className="mb-6"
            />

        {/* MANNEQUIN — visible pour le rendu « Sur modèle » */}
        {style.renderType === 'model' ? (
          <>
            <SectionTitle>Mannequin</SectionTitle>
            <MannequinSelector
              value={style.mannequinOption}
              mannequinId={style.mannequinId}
              onChange={(mannequinOption) => setStyle({ mannequinOption, mannequinId: null })}
              onChangeMannequin={(mannequinId) => setStyle({ mannequinId })}
              className="mb-6"
            />

            {/* COMPLÉTER LA TENUE — tenue commune au lot */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Compléter la tenue"
              onPress={() => router.push('/outfit?target=batch')}
              className="mb-6 flex-row items-center gap-3 rounded-2xl border border-paper3 bg-white p-3 active:bg-paper2"
            >
              <View className="h-10 w-10 items-center justify-center rounded-xl bg-paper2">
                <Ionicons name="shirt-outline" size={20} color={colors.ink} />
              </View>
              <View className="flex-1">
                <Text className="font-body-bold text-[13px] text-ink">Compléter la tenue</Text>
                <Text className="mt-0.5 font-body text-xs text-gray">{outfitSubtitle}</Text>
              </View>
              <View className="rounded-full bg-ink px-3 py-1.5">
                <Text className="font-body-bold text-[11px] text-offwhite">
                  {outfitFilled.length > 0 ? 'Modifier' : 'Configurer'}
                </Text>
              </View>
            </Pressable>
          </>
        ) : null}

        {/* FOND — studio / personnalisé (upload) / fonds réutilisables */}
        <SectionTitle>Fond</SectionTitle>
        <View className="flex-row gap-3">
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: style.backgroundOption === 'studio' }}
            onPress={() => setStyle({ backgroundOption: 'studio' })}
            className={`flex-1 rounded-2xl border px-4 py-4 ${
              style.backgroundOption === 'studio' ? 'border-ink bg-ink' : 'border-paper3 bg-white'
            }`}
          >
            <Text
              className={`font-body-semibold text-sm ${
                style.backgroundOption === 'studio' ? 'text-offwhite' : 'text-ink'
              }`}
            >
              Fond studio
            </Text>
            <Text className="mt-1 font-body text-xs text-gray">Crème, neutre</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: customSelected }}
            onPress={pickCustomBackground}
            className={`flex-1 rounded-2xl border px-4 py-4 ${
              customSelected ? 'border-ink bg-ink' : 'border-dashed border-paper3 bg-white'
            }`}
          >
            <View className="flex-row items-center gap-2">
              {customUpload.localUri ? (
                <Image
                  source={{ uri: customUpload.localUri }}
                  className="h-6 w-6 rounded-md bg-paper3"
                  resizeMode="cover"
                  accessibilityLabel="Fond personnalisé"
                />
              ) : (
                <Ionicons
                  name="add-circle-outline"
                  size={16}
                  color={customSelected ? colors.offwhite : colors.ink}
                />
              )}
              <Text
                className={`font-body-semibold text-sm ${
                  customSelected ? 'text-offwhite' : 'text-ink'
                }`}
              >
                Personnalisé
              </Text>
            </View>
            {customUpload.status === 'uploading' ? (
              <View className="mt-1 flex-row items-center gap-2">
                <ActivityIndicator
                  size="small"
                  color={customSelected ? colors.offwhite : colors.ink}
                />
                <Text className="font-body text-xs text-gray">Envoi du fond…</Text>
              </View>
            ) : customUpload.status === 'error' ? (
              <Text className="mt-1 font-body text-xs text-gray" numberOfLines={2}>
                ⚠️ Envoi impossible — réappuyez
              </Text>
            ) : customSelected && style.customBackgroundUrl ? (
              <Text className="mt-1 font-body text-xs text-gray">
                Fond envoyé — appuyez pour changer
              </Text>
            ) : (
              <Text className="mt-1 font-body text-xs text-gray">Votre boutique, un mur…</Text>
            )}
          </Pressable>
        </View>

        {/* MES FONDS — vignettes réutilisables (GET /backgrounds) */}
        {savedBackgrounds.length > 0 ? (
          <View className="mt-4">
            <Text className="mb-2 font-body-semibold text-[10px] uppercase tracking-[2px] text-gray">
              Mes fonds
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerClassName="gap-2.5 pr-5"
            >
              {savedBackgrounds.map((bg) => {
                const selected = customSelected && style.customBackgroundUrl === bg.imageUrl;
                return (
                  <Pressable
                    key={bg.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Fond ${bg.name}`}
                    accessibilityState={{ selected }}
                    onPress={() =>
                      setStyle({ backgroundOption: 'custom', customBackgroundUrl: bg.imageUrl })
                    }
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
          </>
        )}
      </ScrollView>

      {/* CTA — les choix sont déjà écrits dans le brouillon du lot */}
      <View className="border-t border-paper3 px-5 pb-4 pt-3">
        <Button label="Appliquer au lot" onPress={() => router.back()} />
      </View>
    </SafeAreaView>
  );
}
