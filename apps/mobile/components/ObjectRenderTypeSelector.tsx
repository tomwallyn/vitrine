import { Pressable, Text, View } from 'react-native';

import { OBJECT_RENDER_TYPES, type ObjectRenderType } from '@vitrine/shared';
import { renderTypeLabel } from '@/lib/i18n/labels';

const ICONS: Record<ObjectRenderType, string> = {
  studio_uni: '📦',
  texture: '🧱',
  mise_en_situation: '🛋️',
  ambiance: '🕯️',
  macro: '🔍',
  exterieur: '🌿',
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
            <Text className="text-xl">{ICONS[type]}</Text>
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
