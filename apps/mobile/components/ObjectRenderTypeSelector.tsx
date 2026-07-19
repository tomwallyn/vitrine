import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

import { colors, OBJECT_RENDER_TYPES, type ObjectRenderType } from '@vitrine/shared';
import { renderTypeLabel } from '@/lib/i18n/labels';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

const ICONS: Record<ObjectRenderType, IconName> = {
  studio_uni: 'image-filter-center-focus',
  texture: 'texture-box',
  mise_en_situation: 'sofa-outline',
  ambiance: 'lightbulb-on-outline',
  macro: 'magnify',
  exterieur: 'image-filter-hdr',
};

type ObjectRenderTypeSelectorProps = {
  value: ObjectRenderType;
  onChange: (value: ObjectRenderType) => void;
  className?: string;
};

/** OBJET·1 — TYPE DE RENDU : grille des 6 rendus objet. */
export function ObjectRenderTypeSelector({
  value,
  onChange,
  className = '',
}: ObjectRenderTypeSelectorProps) {
  return (
    <View className={`flex-row flex-wrap gap-2 ${className}`}>
      {OBJECT_RENDER_TYPES.map((type) => {
        const selected = value === type;
        return (
          <Pressable
            key={type}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(type)}
            className={`w-[31%] items-center rounded-2xl border px-2 py-3 ${
              selected ? 'border-ink bg-ink' : 'border-paper3 bg-white'
            }`}
          >
            <MaterialCommunityIcons
              name={ICONS[type]}
              size={22}
              color={selected ? colors.offwhite : colors.ink}
            />
            <Text
              numberOfLines={1}
              className={`mt-1.5 font-body-semibold text-[10.5px] ${
                selected ? 'text-offwhite' : 'text-ink'
              }`}
            >
              {renderTypeLabel(type)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
