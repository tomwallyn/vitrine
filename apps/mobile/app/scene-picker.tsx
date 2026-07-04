import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { memo, useState } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useApi } from '@/lib/api';
import { useRenderDraft } from '@/lib/render-draft';
import {
  colors,
  OBJECT_ACCESSORIES,
  OBJECT_SCENE_CATEGORIES,
  OBJECT_SCENES,
  OBJECT_SURFACES,
  type ObjectSceneCategory,
} from '@vitrine/shared';

type SlotId = 'surface' | 'background' | 'accessoires';
type Selection = { kind: 'preset'; key: string } | { kind: 'decor'; url: string; thumbUrl: string };

const TITLES: Record<SlotId, string> = {
  surface: 'Choisir une surface',
  background: 'Arrière-plan',
  accessoires: 'Accessoires',
};

/** Tuile texte (preset) — module-level + mémoïsée (évite le reload au clic). */
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

/** OBJET·3 — picker d'un slot de scène : presets texte (+ décors perso pour l'arrière-plan). */
export default function ScenePickerScreen() {
  const router = useRouter();
  const api = useApi();
  const params = useLocalSearchParams<{ slot?: string }>();
  const slot = (['surface', 'background', 'accessoires'].includes(params.slot ?? '')
    ? params.slot
    : 'surface') as SlotId;
  const scene = useRenderDraft((s) => s.scene);
  const setScene = useRenderDraft((s) => s.setScene);

  const initial: Selection | null =
    slot === 'surface' && scene.surface
      ? { kind: 'preset', key: scene.surface }
      : slot === 'accessoires' && scene.accessoires
        ? { kind: 'preset', key: scene.accessoires }
        : slot === 'background' && scene.decor?.url
          ? { kind: 'decor', url: scene.decor.url, thumbUrl: scene.decor.thumbUrl ?? scene.decor.url }
          : slot === 'background' && scene.background
            ? { kind: 'preset', key: scene.background }
            : null;
  const [selected, setSelected] = useState<Selection | null>(initial);
  const [category, setCategory] = useState<ObjectSceneCategory>('interieurs');

  // Décors perso (« Mes scènes ») — réutilise le mécanisme des fonds.
  const { data } = useQuery({
    queryKey: ['backgrounds'],
    queryFn: () => api.backgrounds.list(),
    enabled: slot === 'background',
  });
  const decors = data?.backgrounds ?? [];

  const presets =
    slot === 'surface'
      ? OBJECT_SURFACES
      : slot === 'accessoires'
        ? OBJECT_ACCESSORIES
        : OBJECT_SCENES.filter((s) => s.category === category);

  const isPresetSel = (key: string) => selected?.kind === 'preset' && selected.key === key;

  const validate = () => {
    if (!selected) return;
    if (slot === 'surface') setScene({ surface: selected.kind === 'preset' ? selected.key : null });
    else if (slot === 'accessoires')
      setScene({ accessoires: selected.kind === 'preset' ? selected.key : null });
    else if (selected.kind === 'preset') setScene({ background: selected.key, decor: null });
    else
      setScene({
        decor: { url: selected.url, thumbUrl: selected.thumbUrl, status: 'done' },
        background: null,
      });
    router.back();
  };

  return (
    <SafeAreaView className="flex-1 bg-paper">
      <ScreenHeader title={TITLES[slot]} />

      <ScrollView className="flex-1 px-5" contentContainerClassName="pb-6">
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
          {slot === 'background' ? 'Scènes proposées' : 'Suggestions'}
        </Text>
        <View className="flex-row flex-wrap gap-x-[3.5%] gap-y-3">
          {presets.map((p) => (
            <PresetTile
              key={p.key}
              label={p.name}
              selected={isPresetSel(p.key)}
              onPress={() => setSelected({ kind: 'preset', key: p.key })}
            />
          ))}
          {slot === 'background' ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Ajouter un décor"
              onPress={() => router.push('/scene-add')}
              className="w-[31%]"
            >
              <View className="aspect-square items-center justify-center rounded-2xl border-[1.5px] border-dashed border-gray bg-white">
                <Ionicons name="add" size={26} color={colors.ink} />
              </View>
              <Text className="mt-1 text-center font-body-bold text-[9.5px] text-ink">Ajouter</Text>
            </Pressable>
          ) : null}
        </View>

        {/* Mes scènes (décors perso) — arrière-plan uniquement */}
        {slot === 'background' && decors.length > 0 ? (
          <>
            <Text className="mb-3 mt-6 font-body-bold text-[11px] uppercase tracking-[3px] text-gray2">
              Mes scènes · {decors.length}
            </Text>
            <View className="flex-row flex-wrap gap-x-[3.5%] gap-y-3">
              {decors.map((d) => (
                <DecorTile
                  key={d.id}
                  thumbUrl={d.displayUrl}
                  name={d.name}
                  selected={selected?.kind === 'decor' && selected.url === d.imageUrl}
                  onPress={() =>
                    setSelected({ kind: 'decor', url: d.imageUrl, thumbUrl: d.displayUrl })
                  }
                />
              ))}
            </View>
          </>
        ) : null}
      </ScrollView>

      <View className="px-5 pb-2 pt-2">
        <Button label="Valider" onPress={validate} disabled={!selected} />
      </View>
    </SafeAreaView>
  );
}
