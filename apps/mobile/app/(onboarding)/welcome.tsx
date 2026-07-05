import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { t } from '@/lib/i18n';

/** 01 — ACCUEIL : « Un cintre. Une vitrine pro. » */
export default function WelcomeScreen() {
  const router = useRouter();

  return (
    <SafeAreaView className="flex-1 bg-paper">
      <View className="flex-1 px-6">
        {/* Wordmark */}
        <View className="items-center pt-10">
          <Text className="font-heading-bold text-2xl uppercase tracking-[6px] text-ink">
            {t('welcome.wordmark')}
          </Text>
        </View>

        {/* Visuel placeholder : cintre → visuel pro */}
        <View className="mt-10 flex-1 items-center justify-center">
          <View className="h-72 w-56 items-center justify-center rounded-3xl border border-paper3 bg-paper2">
            <Text className="text-6xl">🧥</Text>
            <Badge label={t('welcome.exampleBadge')} variant="light" className="mt-4" />
          </View>
        </View>

        {/* Titre + pitch */}
        <View className="pb-6">
          <Text className="font-heading-bold text-4xl leading-tight text-ink">
            {t('welcome.heading')}
          </Text>
          <Text className="mt-3 font-body text-base leading-6 text-gray2">
            {t('welcome.subtitle')}
          </Text>
        </View>

        {/* Actions */}
        <View className="gap-3 pb-4">
          <Button label={t('welcome.ctaStart')} onPress={() => router.push('/(auth)/sign-up')} />
          <Button
            label={t('welcome.ctaHaveAccount')}
            variant="secondary"
            onPress={() => router.push('/(auth)/sign-in')}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}
