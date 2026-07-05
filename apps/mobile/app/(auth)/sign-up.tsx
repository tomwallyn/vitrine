import { useSignUp } from '@clerk/clerk-expo';
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

/**
 * Auth — Inscription (Clerk : email + mot de passe → code de vérification,
 * Apple, Google). Le shop est créé côté API au premier GET /me.
 */
export default function SignUpScreen() {
  const router = useRouter();
  const { signUp, setActive, isLoaded } = useSignUp();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [pendingVerification, setPendingVerification] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSignUp = async () => {
    if (!isLoaded || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await signUp.create({ emailAddress: email.trim(), password });
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      setPendingVerification(true);
    } catch (err) {
      setError(clerkErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const onVerify = async () => {
    if (!isLoaded || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const attempt = await signUp.attemptEmailAddressVerification({ code: code.trim() });
      if (attempt.status === 'complete') {
        await setActive({ session: attempt.createdSessionId });
        // La garde d'auth (Stack.Protected) bascule vers (tabs).
      } else {
        setError(t('signUp.incompleteError'));
      }
    } catch (err) {
      setError(clerkErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-paper">
      <ScreenHeader title={t('signUp.title')} />
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView className="flex-1 px-6" contentContainerClassName="pt-6 pb-8" keyboardShouldPersistTaps="handled">
          {pendingVerification ? (
            <>
              <Text className="font-heading-bold text-3xl text-ink">{t('signUp.verifyHeading')}</Text>
              <Text className="mt-2 font-body text-base text-gray2">
                {t('signUp.verifySubtitle', { email: email.trim() })}
              </Text>

              <View className="mt-8">
                <TextInput
                  placeholder={t('signUp.codePlaceholder')}
                  placeholderTextColor={colors.gray}
                  value={code}
                  onChangeText={setCode}
                  keyboardType="number-pad"
                  autoComplete="one-time-code"
                  maxLength={6}
                  className="h-14 rounded-2xl border border-paper3 bg-white px-4 text-center font-heading text-lg tracking-[8px] text-ink"
                />
              </View>

              {error ? (
                <Text className="mt-4 font-body-medium text-sm text-ink">⚠️ {error}</Text>
              ) : null}

              <Button
                label={submitting ? t('signUp.verifying') : t('signUp.verify')}
                className="mt-6"
                disabled={!isLoaded || submitting || code.trim().length < 6}
                onPress={onVerify}
              />

              <Pressable className="mt-8" onPress={() => setPendingVerification(false)}>
                <Text className="text-center font-body-semibold text-sm text-gray2">
                  {t('signUp.editEmail')}
                </Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text className="font-heading-bold text-3xl text-ink">
                {t('signUp.heading')}
              </Text>
              <Text className="mt-2 font-body text-base text-gray2">
                {t('signUp.subtitle')}
              </Text>

              <View className="mt-8">
                <OAuthButtons onError={setError} />
                <OAuthDivider />
              </View>

              <View className="gap-3">
                <TextInput
                  placeholder={t('signUp.emailPlaceholder')}
                  placeholderTextColor={colors.gray}
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  className="h-14 rounded-2xl border border-paper3 bg-white px-4 font-body text-base text-ink"
                />
                <TextInput
                  placeholder={t('signUp.passwordPlaceholder')}
                  placeholderTextColor={colors.gray}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoComplete="new-password"
                  className="h-14 rounded-2xl border border-paper3 bg-white px-4 font-body text-base text-ink"
                />
              </View>

              {error ? (
                <Text className="mt-4 font-body-medium text-sm text-ink">⚠️ {error}</Text>
              ) : null}

              <Button
                label={submitting ? t('signUp.creating') : t('signUp.submit')}
                className="mt-6"
                disabled={!isLoaded || submitting || !email.trim() || password.length < 8}
                onPress={onSignUp}
              />

              <Pressable className="mt-8" onPress={() => router.replace('/(auth)/sign-in')}>
                <Text className="text-center font-body-semibold text-sm text-gray2">
                  {t('signUp.hasAccount')} <Text className="text-ink">{t('signUp.signIn')}</Text>
                </Text>
              </Pressable>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
