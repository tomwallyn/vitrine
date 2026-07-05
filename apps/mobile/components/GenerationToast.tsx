import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { SlideInUp, SlideOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';

import { colors } from '@vitrine/shared';

import { t } from '@/lib/i18n';

/** Durée d'affichage du banner avant auto-dismiss. */
const AUTO_DISMISS_MS = 5_000;

type ToastPayload = {
  generationId: string;
  kind: 'done' | 'failed';
  /** Clé de remontage : re-déclenche l'animation si un toast en remplace un autre. */
  key: number;
};

type GenerationToastState = {
  toast: ToastPayload | null;
  show: (generationId: string, kind: 'done' | 'failed') => void;
  hide: () => void;
};

const useGenerationToastStore = create<GenerationToastState>((set) => ({
  toast: null,
  show: (generationId, kind) => set({ toast: { generationId, kind, key: Date.now() } }),
  hide: () => set({ toast: null }),
}));

/** Affiche le banner in-app de fin de génération (appelé par le tracker). */
export function showGenerationToast(generationId: string, kind: 'done' | 'failed'): void {
  useGenerationToastStore.getState().show(generationId, kind);
}

/**
 * Banner in-app (foreground) « ✨ Ton visuel est prêt » / « La génération a
 * échoué » — monté au root (_layout), slide-in reanimated depuis le haut,
 * tap → écran résultat, auto-dismiss ~5 s.
 */
export function GenerationToast() {
  const toast = useGenerationToastStore((state) => state.toast);
  const hide = useGenerationToastStore((state) => state.hide);
  const insets = useSafeAreaInsets();
  const router = useRouter();

  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(hide, AUTO_DISMISS_MS);
    return () => clearTimeout(timeout);
  }, [toast, hide]);

  if (!toast) return null;

  const done = toast.kind === 'done';
  const onPress = () => {
    const { generationId } = toast;
    hide();
    if (done) router.push(`/result/${generationId}`);
  };

  return (
    <Animated.View
      key={toast.key}
      entering={SlideInUp.duration(350)}
      exiting={SlideOutUp.duration(250)}
      style={{ position: 'absolute', top: insets.top + 8, left: 16, right: 16 }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          done
            ? t('generationToast.readyAccessibilityLabel')
            : t('generationToast.failedAccessibilityLabel')
        }
        onPress={onPress}
        className="flex-row items-center gap-3 rounded-2xl bg-ink px-4 py-3.5 shadow-lg active:opacity-90"
      >
        <Text className="text-lg">{done ? '✨' : '⚠️'}</Text>
        <View className="flex-1">
          <Text className="font-body-semibold text-sm text-offwhite">
            {done ? t('generationToast.readyTitle') : t('generationToast.failedTitle')}
          </Text>
          <Text className="mt-0.5 font-body text-xs text-gray">
            {done ? t('generationToast.readySubtitle') : t('generationToast.failedSubtitle')}
          </Text>
        </View>
        <Ionicons
          name={done ? 'chevron-forward' : 'close'}
          size={16}
          color={colors.offwhite}
        />
      </Pressable>
    </Animated.View>
  );
}
