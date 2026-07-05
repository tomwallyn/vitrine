import { Pressable, Text, View } from 'react-native';

import { t } from '@/lib/i18n';
import { type RenderType } from '@vitrine/shared';

const RENDER_STYLES: { value: RenderType; label: string; icon: string }[] = [
  { value: 'model', label: t('renderTypeSelector.model'), icon: '🧍' },
  { value: 'hanger', label: t('renderTypeSelector.hanger'), icon: '🧥' },
  { value: 'folded', label: t('renderTypeSelector.folded'), icon: '🗂️' },
  { value: 'studio', label: t('renderTypeSelector.studio'), icon: '📦' },
];

type RenderTypeSelectorProps = {
  value: RenderType;
  onChange: (value: RenderType) => void;
  className?: string;
};

/** Écran 03 — STYLE DE VISUEL : grille des 4 types de rendu. */
export function RenderTypeSelector({ value, onChange, className = '' }: RenderTypeSelectorProps) {
  return (
    <View className={`flex-row flex-wrap gap-3 ${className}`}>
      {RENDER_STYLES.map((item) => {
        const selected = value === item.value;
        return (
          <Pressable
            key={item.value}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(item.value)}
            className={`w-[47%] items-center rounded-2xl border px-3 py-4 ${
              selected ? 'border-ink bg-ink' : 'border-paper3 bg-white'
            }`}
          >
            <Text className="text-2xl">{item.icon}</Text>
            <Text
              className={`mt-2 font-body-semibold text-sm ${
                selected ? 'text-offwhite' : 'text-ink'
              }`}
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
