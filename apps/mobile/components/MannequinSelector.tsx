import { Ionicons } from '@expo/vector-icons';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';

import { t } from '@/lib/i18n';
import { colors, MANNEQUINS, type MannequinOption } from '@vitrine/shared';

const CATEGORIES: { value: MannequinOption; label: string }[] = [
  { value: 'femme', label: t('mannequinSelector.categoryFemale') },
  { value: 'homme', label: t('mannequinSelector.categoryMale') },
  { value: 'silhouette', label: t('mannequinSelector.categorySilhouette') },
  { value: 'studio', label: t('mannequinSelector.categoryStudio') },
];

type MannequinSelectorProps = {
  /** Catégorie sélectionnée (femme/homme/silhouette/studio). */
  value: MannequinOption;
  onChange: (value: MannequinOption) => void;
  /**
   * Choix du modèle (vignettes) — optionnel : fournir `mannequinId` +
   * `onChangeMannequin` active la bande de modèles. Sans eux, sélecteur de
   * catégorie seul (ex. préréglages de rendu).
   */
  mannequinId?: string | null;
  onChangeMannequin?: (id: string) => void;
  className?: string;
};

/**
 * Écran 03 — MANNEQUIN : chips de catégorie + choix du modèle par vignette
 * (plusieurs Femme/Homme/Silhouette). `studio` n'a pas de modèle (packshot ghost).
 */
export function MannequinSelector({
  value,
  mannequinId,
  onChange,
  onChangeMannequin,
  className = '',
}: MannequinSelectorProps) {
  const variants = value === 'studio' ? [] : MANNEQUINS[value];
  const selectedId = mannequinId ?? variants[0]?.id;
  const showVariants = !!onChangeMannequin && variants.length > 0;

  return (
    <View className={className}>
      <View className="flex-row flex-wrap gap-2">
        {CATEGORIES.map((item) => {
          const selected = value === item.value;
          return (
            <Pressable
              key={item.value}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => onChange(item.value)}
              className={`rounded-full border px-5 py-2.5 ${
                selected ? 'border-ink bg-ink' : 'border-paper3 bg-white'
              }`}
            >
              <Text
                className={`font-body-semibold text-sm ${selected ? 'text-offwhite' : 'text-ink'}`}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Choix du modèle (vignettes) pour la catégorie sélectionnée */}
      {showVariants ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-2.5 pr-5"
          className="mt-3"
        >
          {variants.map((m) => {
            const selected = selectedId === m.id;
            return (
              <Pressable
                key={m.id}
                accessibilityRole="button"
                accessibilityLabel={m.name}
                accessibilityState={{ selected }}
                onPress={() => onChangeMannequin?.(m.id)}
                className={`overflow-hidden rounded-xl border-2 ${
                  selected ? 'border-ink' : 'border-paper3'
                }`}
              >
                <Image
                  source={{ uri: m.url }}
                  className="h-28 w-[74px] bg-paper2"
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
      ) : null}
    </View>
  );
}
