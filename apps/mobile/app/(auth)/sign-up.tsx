import { useRouter } from 'expo-router';
import { Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { ScreenHeader } from '@/components/ScreenHeader';
import { colors } from '@vitrine/shared';

/** Auth — Inscription (placeholder M0, Clerk branché en M1). */
export default function SignUpScreen() {
  const router = useRouter();

  return (
    <SafeAreaView className="flex-1 bg-paper">
      <ScreenHeader title="Créer un compte" />
      <View className="flex-1 px-6 pt-6">
        <Text className="font-heading-bold text-3xl text-ink">Votre boutique,{'\n'}en vitrine.</Text>
        <Text className="mt-2 font-body text-base text-gray2">
          Créez votre compte pour générer vos premiers visuels.
        </Text>

        <View className="mt-8 gap-3">
          <TextInput
            placeholder="Nom de la boutique"
            placeholderTextColor={colors.gray}
            editable={false}
            className="h-14 rounded-2xl border border-paper3 bg-white px-4 font-body text-base text-ink"
          />
          <TextInput
            placeholder="Email"
            placeholderTextColor={colors.gray}
            editable={false}
            className="h-14 rounded-2xl border border-paper3 bg-white px-4 font-body text-base text-ink"
          />
        </View>

        {/* TODO(M1): Clerk — email + Sign in with Apple + Google */}
        <Button
          label="Créer ma boutique"
          className="mt-6"
          onPress={() => router.replace('/(tabs)')}
        />
        <Text className="mt-4 text-center font-body text-xs text-gray">
          Auth Clerk (email · Apple · Google) branchée au jalon M1
        </Text>

        <Pressable className="mt-8" onPress={() => router.replace('/(auth)/sign-in')}>
          <Text className="text-center font-body-semibold text-sm text-gray2">
            Déjà un compte ? <Text className="text-ink">Se connecter</Text>
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
