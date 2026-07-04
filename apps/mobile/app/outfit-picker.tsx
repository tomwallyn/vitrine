import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { memo, useState } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useApi } from '@/lib/api';
import { SLOT_LABEL } from '@/lib/outfit';
import { useOutfitTarget, type OutfitTarget } from '@/lib/use-outfit-target';
import { colors, DEFAULT_GARMENT_IMAGES, garmentSlotSchema, type GarmentSlot } from '@vitrine/shared';

/** Article FR pour le titre (« Choisir un bas » / « des chaussures »). */
const SLOT_ARTICLE: Record<GarmentSlot, string> = {
  haut: 'un haut',
  bas: 'un bas',
  chaussures: 'des chaussures',
};

type Choice = { key: string; name: string; thumbUrl: string; url: string };

/**
 * Tuile de suggestion — définie au niveau module (et mémoïsée) : sinon, la
 * redéfinir dans le rendu de l'écran remonterait toutes les tuiles à chaque
 * sélection → les vignettes se rechargeraient (flicker au clic).
 */
const PickerTile = memo(function PickerTile({
  choice,
  selected,
  onSelect,
}: {
  choice: Choice;
  selected: boolean;
  onSelect: (choice: Choice) => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={choice.name}
      accessibilityState={{ selected }}
      onPress={() => onSelect(choice)}
      className="w-[31%]"
    >
      <View
        className={`overflow-hidden rounded-2xl border bg-white ${
          selected ? 'border-2 border-ink' : 'border-paper3'
        }`}
      >
        <Image
          source={{ uri: choice.thumbUrl }}
          className="aspect-square w-full bg-paper2"
          resizeMode="cover"
        />
        {selected ? (
          <View className="absolute right-1.5 top-1.5 h-5 w-5 items-center justify-center rounded-full bg-ink">
            <Ionicons name="checkmark" size={12} color={colors.offwhite} />
          </View>
        ) : null}
      </View>
      <Text numberOfLines={1} className="mt-1 text-center font-body-semibold text-[9.5px] text-ink">
        {choice.name}
      </Text>
    </Pressable>
  );
});

/** MODÈLE·2 — « Choisir une pièce » : suggestions par défaut + garde-robe. */
export default function OutfitPickerScreen() {
  const router = useRouter();
  const api = useApi();
  const params = useLocalSearchParams<{ slot?: string; target?: OutfitTarget }>();
  const slot = garmentSlotSchema.catch('bas').parse(params.slot);
  const target = params.target ?? 'single';
  const ctrl = useOutfitTarget(target);

  const current = ctrl.outfit[slot];
  const [selected, setSelected] = useState<Choice | null>(
    current?.url ? { key: 'current', name: '', thumbUrl: current.thumbUrl ?? current.url, url: current.url } : null,
  );

  // Pièces custom enregistrées pour ce slot (garde-robe).
  const { data } = useQuery({
    queryKey: ['garments', slot],
    queryFn: () => api.garments.list(slot),
  });
  const saved: Choice[] = (data?.garments ?? []).map((g) => ({
    key: `saved-${g.id}`,
    name: g.name,
    thumbUrl: g.displayUrl,
    url: g.imageUrl,
  }));
  const suggestions: Choice[] = DEFAULT_GARMENT_IMAGES[slot].map((d) => ({
    key: `def-${d.key}`,
    name: d.name,
    thumbUrl: d.url,
    url: d.url,
  }));

  const validate = () => {
    if (!selected) return;
    ctrl.setOutfitPiece(slot, { url: selected.url, thumbUrl: selected.thumbUrl, status: 'done' });
    router.back();
  };

  return (
    <SafeAreaView className="flex-1 bg-paper">
      <ScreenHeader title={`Choisir ${SLOT_ARTICLE[slot]}`} />

      <ScrollView className="flex-1 px-5" contentContainerClassName="pb-6">
        {/* Suggestions par défaut + Ajouter */}
        <Text className="mb-3 font-body-bold text-[11px] uppercase tracking-[3px] text-gray2">
          Suggestions
        </Text>
        <View className="flex-row flex-wrap gap-x-[3.5%] gap-y-3">
          {suggestions.map((choice) => (
            <PickerTile
              key={choice.key}
              choice={choice}
              selected={selected?.url === choice.url}
              onSelect={setSelected}
            />
          ))}
          {/* Ajouter une pièce custom */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Ajouter une pièce"
            onPress={() => router.push(`/outfit-add?slot=${slot}&target=${target}`)}
            className="w-[31%]"
          >
            <View className="aspect-square items-center justify-center rounded-2xl border-[1.5px] border-dashed border-gray bg-white">
              <Ionicons name="add" size={26} color={colors.ink} />
            </View>
            <Text className="mt-1 text-center font-body-bold text-[9.5px] text-ink">Ajouter</Text>
          </Pressable>
        </View>

        {/* Garde-robe : mes pièces enregistrées pour ce slot */}
        {saved.length > 0 ? (
          <>
            <Text className="mb-3 mt-6 font-body-bold text-[11px] uppercase tracking-[3px] text-gray2">
              Mes pièces · {saved.length}
            </Text>
            <View className="flex-row flex-wrap gap-x-[3.5%] gap-y-3">
              {saved.map((choice) => (
                <PickerTile
              key={choice.key}
              choice={choice}
              selected={selected?.url === choice.url}
              onSelect={setSelected}
            />
              ))}
            </View>
          </>
        ) : null}
      </ScrollView>

      <View className="px-5 pb-2 pt-2">
        <Button label={`Valider ${SLOT_LABEL[slot].toLowerCase()}`} onPress={validate} disabled={!selected} />
      </View>
    </SafeAreaView>
  );
}
