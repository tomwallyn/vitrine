import { useSignIn } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { OAuthButtons, OAuthDivider } from '@/components/OAuthButtons';
import { ScreenHeader } from '@/components/ScreenHeader';
import { clerkErrorMessage } from '@/lib/clerk-error';
import { t } from '@/lib/i18n';
import { colors } from '@vitrine/shared';

/** Auth — Connexion (Clerk : email + mot de passe, Apple, Google). */
export default function SignInScreen() {
  const router = useRouter();
  const { signIn, setActive, isLoaded } = useSignIn();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSignIn = async () => {
    if (!isLoaded || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const attempt = await signIn.create({ identifier: email.trim(), password });
      if (attempt.status === 'complete') {
        await setActive({ session: attempt.createdSessionId });
        // La garde d'auth (Stack.Protected) bascule vers (tabs).
      } else {
        setError(t('signIn.incompleteError'));
      }
    } catch (err) {
      setError(clerkErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-paper">
      <ScreenHeader title={t('signIn.title')} />
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView className="flex-1 px-6" contentContainerClassName="pt-6 pb-8" keyboardShouldPersistTaps="handled">
          <Text className="font-heading-bold text-3xl text-ink">{t('signIn.heading')}</Text>
          <Text className="mt-2 font-body text-base text-gray2">{t('signIn.subtitle')}</Text>

          <View className="mt-8">
            <OAuthButtons onError={setError} />
            <OAuthDivider />
          </View>

          <View className="gap-3">
            <TextInput
              placeholder={t('signIn.emailPlaceholder')}
              placeholderTextColor={colors.gray}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              className="h-14 rounded-2xl border border-paper3 bg-white px-4 font-body text-base text-ink"
            />
            <TextInput
              placeholder={t('signIn.passwordPlaceholder')}
              placeholderTextColor={colors.gray}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="password"
              className="h-14 rounded-2xl border border-paper3 bg-white px-4 font-body text-base text-ink"
            />
          </View>

          {error ? (
            <Text className="mt-4 font-body-medium text-sm text-ink">⚠️ {error}</Text>
          ) : null}

          <Button
            label={submitting ? t('signIn.submitting') : t('signIn.submit')}
            className="mt-6"
            disabled={!isLoaded || submitting || !email.trim() || !password}
            onPress={onSignIn}
          />

          <Pressable className="mt-8" onPress={() => router.replace('/(auth)/sign-up')}>
            <Text className="text-center font-body-semibold text-sm text-gray2">
              {t('signIn.noAccount')} <Text className="text-ink">{t('signIn.createAccount')}</Text>
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
