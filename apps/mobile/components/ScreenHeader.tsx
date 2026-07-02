import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import type { ReactNode } from 'react';

import { colors } from '@vitrine/shared';

type ScreenHeaderProps = {
  title: string;
  /** Sous-titre optionnel (ex. numéro d'étape de la maquette). */
  subtitle?: string;
  showBack?: boolean;
  right?: ReactNode;
};

/** En-tête d'écran : retour + titre Space Grotesk uppercase + slot droit. */
export function ScreenHeader({ title, subtitle, showBack = true, right }: ScreenHeaderProps) {
  const router = useRouter();

  return (
    <View className="flex-row items-center justify-between px-5 py-4">
      <View className="w-10">
        {showBack && router.canGoBack() ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retour"
            onPress={() => router.back()}
            className="h-10 w-10 items-center justify-center rounded-full bg-paper2 active:bg-paper3"
          >
            <Ionicons name="chevron-back" size={20} color={colors.ink} />
          </Pressable>
        ) : null}
      </View>
      <View className="flex-1 items-center">
        {subtitle ? (
          <Text className="font-body-semibold text-[10px] uppercase tracking-[3px] text-gray">
            {subtitle}
          </Text>
        ) : null}
        <Text className="font-heading text-base uppercase tracking-[2px] text-ink">{title}</Text>
      </View>
      <View className="min-w-10 items-end">{right}</View>
    </View>
  );
}
