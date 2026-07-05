import { useClerk } from '@clerk/clerk-expo';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { colors } from '@vitrine/shared';

/**
 * Retour du flux OAuth natif Clerk (Apple/Google). Sur Android, le deep link
 * `vitrine://oauth-native-callback?created_session_id=…` peut atterrir sur le
 * routeur au lieu d'être capté par le navigateur d'auth → « Unmatched Route ».
 * Ce fallback active alors la session à la main puis redirige vers l'accueil
 * (la garde d'auth bascule ensuite sur les tabs).
 */
export default function OAuthNativeCallback() {
  const { setActive } = useClerk();
  const router = useRouter();
  const { created_session_id: createdSessionId } = useLocalSearchParams<{
    created_session_id?: string;
  }>();

  useEffect(() => {
    (async () => {
      try {
        if (createdSessionId && setActive) {
          await setActive({ session: createdSessionId });
        }
      } catch {
        // Échec d'activation → retour à l'accueil (l'utilisateur retentera).
      }
      router.replace('/');
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createdSessionId]);

  return (
    <View className="flex-1 items-center justify-center bg-paper">
      <ActivityIndicator color={colors.ink} />
    </View>
  );
}
