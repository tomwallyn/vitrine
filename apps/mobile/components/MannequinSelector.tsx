import { Pressable, Text, View } from 'react-native';

import { type MannequinOption } from '@vitrine/shared';

const MANNEQUINS: { value: MannequinOption; label: string }[] = [
  { value: 'femme', label: 'Femme' },
  { value: 'homme', label: 'Homme' },
  { value: 'silhouette', label: 'Silhouette' },
  { value: 'studio', label: 'Studio' },
];

type MannequinSelectorProps = {
  value: MannequinOption;
  onChange: (value: MannequinOption) => void;
  className?: string;
};

/** Écran 03 — MANNEQUIN : chips femme / homme / silhouette / studio. */
export function MannequinSelector({ value, onChange, className = '' }: MannequinSelectorProps) {
  return (
    <View className={`flex-row flex-wrap gap-2 ${className}`}>
      {MANNEQUINS.map((item) => {
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
  );
}
