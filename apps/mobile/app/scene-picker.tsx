import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { memo, useState } from 'react';
import { Image, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useApi } from '@/lib/api';
import { t } from '@/lib/i18n';
import { useSceneTarget } from '@/lib/use-scene-target';
import {
  colors,
  OBJECT_ACCESSORIES,
  OBJECT_SCENE_CATEGORIES,
  OBJECT_SCENES,
  OBJECT_SURFACES,
  type ObjectSceneCategory,
  type ScenePresetSlot,
} from '@vitrine/shared';

type SlotId = ScenePresetSlot;
/** Une sélection : une valeur (clé preset OU texte libre) ou un décor perso image. */
type Selection = { kind: 'value'; value: string } | { kind: 'decor'; url: string; thumbUrl: string };

const TITLES: Record<SlotId, string> = {
  surface: t('scenePicker.titleSurface'),
  background: t('scenePicker.titleBackground'),
  accessoires: t('scenePicker.titleAccessoires'),
};
const CUSTOM_PLACEHOLDER: Record<SlotId, string> = {
  surface: t('scenePicker.placeholderSurface'),
  background: t('scenePicker.placeholderBackground'),
  accessoires: t('scenePicker.placeholderAccessoires'),
};

/** Tuile texte (preset built-in ou description perso) — mémoïsée. */
const PresetTile = memo(function PresetTile({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      className={`w-[31%] items-center justify-center rounded-2xl border bg-white px-2 py-4 ${
        selected ? 'border-2 border-ink' : 'border-paper3'
      }`}
    >
      <Text
        numberOfLines={2}
        className={`text-center font-body-semibold text-[11px] ${selected ? 'text-ink' : 'text-gray2'}`}
      >
        {label}
      </Text>
      {selected ? (
        <View className="absolute right-1.5 top-1.5 h-5 w-5 items-center justify-center rounded-full bg-ink">
          <Ionicons name="checkmark" size={12} color={colors.offwhite} />
        </View>
      ) : null}
    </Pressable>
  );
});

/** Tuile image (décor perso « Mes scènes »). */
const DecorTile = memo(function DecorTile({
  thumbUrl,
  name,
  selected,
  onPress,
}: {
  thumbUrl: string;
  name: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={name} onPress={onPress} className="w-[31%]">
      <View
        className={`overflow-hidden rounded-2xl border bg-white ${
          selected ? 'border-2 border-ink' : 'border-paper3'
        }`}
      >
        <Image source={{ uri: thumbUrl }} className="aspect-square w-full bg-paper2" resizeMode="cover" />
        {selected ? (
          <View className="absolute right-1.5 top-1.5 h-5 w-5 items-center justify-center rounded-full bg-ink">
            <Ionicons name="checkmark" size={12} color={colors.offwhite} />
          </View>
        ) : null}
      </View>
      <Text numberOfLines={1} className="mt-1 text-center font-body-semibold text-[9.5px] text-ink">
        {name}
      </Text>
    </Pressable>
  );
});

/** OBJET·3 — picker d'un slot de scène : presets texte, description perso enregistrable, décors perso. */
export default function ScenePickerScreen() {
  const router = useRouter();
  const api = useApi();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ slot?: string; target?: string }>();
  const slot = (['surface', 'background', 'accessoires'].includes(params.slot ?? '')
    ? params.slot
    : 'surface') as SlotId;
  const target = params.target === 'batch' ? 'batch' : 'single';
  const { scene, setScene } = useSceneTarget(target);

  const builtinKeys = new Set([
    ...OBJECT_SURFACES.map((s) => s.key),
    ...OBJECT_SCENES.map((s) => s.key),
    ...OBJECT_ACCESSORIES.map((s) => s.key),
  ]);
  const currentValue =
    slot === 'surface' ? scene.surface : slot === 'accessoires' ? scene.accessoires : scene.background;
  const initial: Selection | null =
    slot === 'background' && scene.decor?.url
      ? { kind: 'decor', url: scene.decor.url, thumbUrl: scene.decor.thumbUrl ?? scene.decor.url }
      : currentValue
        ? { kind: 'value', value: currentValue }
        : null;
  const [selected, setSelected] = useState<Selection | null>(initial);
  const [category, setCategory] = useState<ObjectSceneCategory>('interieurs');
  // Champ « décrivez la vôtre » — prérempli si la valeur courante est déjà du texte libre.
  const [customText, setCustomText] = useState(
    currentValue && !builtinKeys.has(currentValue) ? currentValue : '',
  );

  // Descriptions perso enregistrées (par slot).
  const { data: presetsData } = useQuery({
    queryKey: ['scene-presets', slot],
    queryFn: () => api.scenePresets.list(slot),
  });
  const savedPresets = presetsData?.presets ?? [];

  // Décors perso image (« Mes scènes ») — arrière-plan uniquement.
  const { data: decorsData } = useQuery({
    queryKey: ['backgrounds'],
    queryFn: () => api.backgrounds.list(),
    enabled: slot === 'background',
  });
  const decors = decorsData?.backgrounds ?? [];

  // Enregistre la description perso (dédupliquée côté serveur) et la sélectionne.
  const saveMutation = useMutation({
    mutationFn: (text: string) => api.scenePresets.create({ slot, text }),
    onSuccess: ({ preset }) => {
      queryClient.invalidateQueries({ queryKey: ['scene-presets', slot] });
      setSelected({ kind: 'value', value: preset.text });
      setCustomText('');
    },
  });

  const commitCustom = () => {
    const text = customText.trim();
    if (text.length === 0 || saveMutation.isPending) return;
    saveMutation.mutate(text);
  };

  const builtins =
    slot === 'surface'
      ? OBJECT_SURFACES
      : slot === 'accessoires'
        ? OBJECT_ACCESSORIES
        : OBJECT_SCENES.filter((s) => s.category === category);

  const isValueSel = (v: string) => selected?.kind === 'value' && selected.value === v;

  const validate = () => {
    if (slot === 'surface')
      setScene({ surface: selected?.kind === 'value' ? selected.value : null });
    else if (slot === 'accessoires')
      setScene({ accessoires: selected?.kind === 'value' ? selected.value : null });
    else if (selected?.kind === 'decor')
      setScene({
        decor: { url: selected.url, thumbUrl: selected.thumbUrl, status: 'done' },
        background: null,
      });
    else setScene({ background: selected?.kind === 'value' ? selected.value : null, decor: null });
    router.back();
  };

  return (
    <SafeAreaView className="flex-1 bg-paper">
      <ScreenHeader title={TITLES[slot]} />

      <ScrollView className="flex-1 px-5" contentContainerClassName="pb-6" keyboardShouldPersistTaps="handled">
        {/* Onglets catégorie (arrière-plan uniquement) */}
        {slot === 'background' ? (
          <View className="mb-4 flex-row gap-2">
            {OBJECT_SCENE_CATEGORIES.map((c) => {
              const active = category === c.key;
              return (
                <Pressable
                  key={c.key}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => setCategory(c.key)}
                  className={`rounded-full border px-4 py-2 ${
                    active ? 'border-ink bg-ink' : 'border-paper3 bg-white'
                  }`}
                >
                  <Text
                    className={`font-body-semibold text-[12px] ${active ? 'text-offwhite' : 'text-ink'}`}
                  >
                    {c.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        <Text className="mb-3 font-body-bold text-[11px] uppercase tracking-[3px] text-gray2">
          {slot === 'background' ? t('scenePicker.suggestedScenes') : t('scenePicker.suggestions')}
        </Text>
        <View className="flex-row flex-wrap gap-x-[3.5%] gap-y-3">
          {builtins.map((p) => (
            <PresetTile
              key={p.key}
              label={p.name}
              selected={isValueSel(p.key)}
              onPress={() => setSelected({ kind: 'value', value: p.key })}
            />
          ))}
          {slot === 'background' ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('scenePicker.addDecorLabel')}
              onPress={() => router.push(`/scene-add?target=${target}`)}
              className="w-[31%]"
            >
              <View className="aspect-square items-center justify-center rounded-2xl border-[1.5px] border-dashed border-gray bg-white">
                <Ionicons name="add" size={26} color={colors.ink} />
              </View>
              <Text className="mt-1 text-center font-body-bold text-[9.5px] text-ink">{t('common.add')}</Text>
            </Pressable>
          ) : null}
        </View>

        {/* Décrire la vôtre (texte libre) + enregistrement */}
        <Text className="mb-2 mt-6 font-body-bold text-[11px] uppercase tracking-[3px] text-gray2">
          {t('scenePicker.describeYours')}
        </Text>
        <View className="flex-row items-center gap-2 rounded-2xl border border-paper3 bg-white px-3.5 py-1">
          <Ionicons name="create-outline" size={16} color={colors.gray} />
          <TextInput
            value={customText}
            onChangeText={setCustomText}
            placeholder={CUSTOM_PLACEHOLDER[slot]}
            placeholderTextColor={colors.gray}
            className="flex-1 py-2.5 font-body text-sm text-ink"
            returnKeyType="done"
            onSubmitEditing={commitCustom}
            maxLength={80}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('scenePicker.saveDescriptionLabel')}
            hitSlop={8}
            disabled={customText.trim().length === 0 || saveMutation.isPending}
            onPress={commitCustom}
            className={`rounded-full px-3 py-1.5 ${
              customText.trim().length > 0 ? 'bg-ink' : 'bg-paper3'
            }`}
          >
            <Text
              className={`font-body-bold text-[11px] ${
                customText.trim().length > 0 ? 'text-offwhite' : 'text-gray'
              }`}
            >
              {t('common.save')}
            </Text>
          </Pressable>
        </View>

        {/* Mes descriptions enregistrées */}
        {savedPresets.length > 0 ? (
          <>
            <Text className="mb-3 mt-6 font-body-bold text-[11px] uppercase tracking-[3px] text-gray2">
              {t('scenePicker.myDescriptions', { count: savedPresets.length })}
            </Text>
            <View className="flex-row flex-wrap gap-x-[3.5%] gap-y-3">
              {savedPresets.map((p) => (
                <PresetTile
                  key={p.id}
                  label={p.text}
                  selected={isValueSel(p.text)}
                  onPress={() => setSelected({ kind: 'value', value: p.text })}
                />
              ))}
            </View>
          </>
        ) : null}

        {/* Mes scènes (décors perso image) — arrière-plan uniquement */}
        {slot === 'background' && decors.length > 0 ? (
          <>
            <Text className="mb-3 mt-6 font-body-bold text-[11px] uppercase tracking-[3px] text-gray2">
              {t('scenePicker.myScenes', { count: decors.length })}
            </Text>
            <View className="flex-row flex-wrap gap-x-[3.5%] gap-y-3">
              {decors.map((d) => (
                <DecorTile
                  key={d.id}
                  thumbUrl={d.displayUrl}
                  name={d.name}
                  selected={selected?.kind === 'decor' && selected.url === d.imageUrl}
                  onPress={() => setSelected({ kind: 'decor', url: d.imageUrl, thumbUrl: d.displayUrl })}
                />
              ))}
            </View>
          </>
        ) : null}
      </ScrollView>

      <View className="px-5 pb-2 pt-2">
        <Button label={t('scenePicker.validate')} onPress={validate} disabled={!selected} />
      </View>
    </SafeAreaView>
  );
}
