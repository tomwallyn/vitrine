import { useOAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { clerkErrorMessage } from '@/lib/clerk-error';
import { t } from '@/lib/i18n';
import { colors } from '@vitrine/shared';

// Termine proprement la session d'auth du navigateur au retour dans l'app.
WebBrowser.maybeCompleteAuthSession();

type OAuthButtonsProps = {
  onError?: (message: string) => void;
};

/** Boutons Apple / Google (Clerk useOAuth) — sign-in et sign-up confondus. */
export function OAuthButtons({ onError }: OAuthButtonsProps) {
  const { startOAuthFlow: startAppleFlow } = useOAuth({ strategy: 'oauth_apple' });
  const { startOAuthFlow: startGoogleFlow } = useOAuth({ strategy: 'oauth_google' });
  const [busy, setBusy] = useState(false);

  const run = async (startFlow: typeof startAppleFlow) => {
    if (busy) return;
    setBusy(true);
    try {
      const { createdSessionId, setActive } = await startFlow();
      if (createdSessionId && setActive) {
        // La garde d'auth (Stack.Protected) bascule vers (tabs) automatiquement.
        await setActive({ session: createdSessionId });
      }
    } catch (err) {
      onError?.(clerkErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const buttons = [
    { key: 'apple', icon: 'logo-apple' as const, label: t('oAuthButtons.continueApple'), flow: startAppleFlow },
    { key: 'google', icon: 'logo-google' as const, label: t('oAuthButtons.continueGoogle'), flow: startGoogleFlow },
  ];

  return (
    <View className="gap-3">
      {buttons.map((btn) => (
        <Pressable
          key={btn.key}
          accessibilityRole="button"
          disabled={busy}
          onPress={() => run(btn.flow)}
          className={`h-14 flex-row items-center justify-center gap-2.5 rounded-full border border-paper3 bg-white active:bg-paper2 ${
            busy ? 'opacity-40' : ''
          }`}
        >
          <Ionicons name={btn.icon} size={18} color={colors.ink} />
          <Text className="font-body-semibold text-base text-ink">{btn.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** Séparateur « ou » entre OAuth et formulaire email. */
export function OAuthDivider() {
  return (
    <View className="my-6 flex-row items-center gap-3">
      <View className="h-px flex-1 bg-paper3" />
      <Text className="font-body text-xs uppercase tracking-widest text-gray">{t('oAuthButtons.or')}</Text>
      <View className="h-px flex-1 bg-paper3" />
    </View>
  );
}
