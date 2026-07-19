import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

import { t } from '@/lib/i18n';
import { colors, type RenderType } from '@vitrine/shared';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

const RENDER_STYLES: { value: RenderType; label: string; icon: IconName }[] = [
  { value: 'model', label: t('renderTypeSelector.model'), icon: 'account-outline' },
  { value: 'hanger', label: t('renderTypeSelector.hanger'), icon: 'hanger' },
  { value: 'folded', label: t('renderTypeSelector.folded'), icon: 'tshirt-crew-outline' },
  { value: 'studio', label: t('renderTypeSelector.studio'), icon: 'image-filter-center-focus' },
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
            <MaterialCommunityIcons
              name={item.icon}
              size={26}
              color={selected ? colors.offwhite : colors.ink}
            />
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
