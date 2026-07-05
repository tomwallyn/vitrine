import { useRouter } from 'expo-router';
import { Image, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { t } from '@/lib/i18n';

/** 01 — ACCUEIL : image hero plein largeur (bas arrondi) → « Une photo. Une vitrine pro. » */
export default function WelcomeScreen() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  // Grande image plein largeur en haut, plafonnée pour laisser respirer le texte.
  const imageHeight = Math.min(width * (4 / 3), height * 0.58);

  return (
    <View className="flex-1 bg-paper">
      {/* Visuel hero : plein largeur, bleed sous la status bar, bas arrondi + ombre douce */}
      <View
        style={{
          width,
          height: imageHeight,
          shadowColor: '#111111',
          shadowOpacity: 0.1,
          shadowRadius: 20,
          shadowOffset: { width: 0, height: 10 },
        }}
        className="absolute left-0 top-0"
      >
        <View className="h-full w-full overflow-hidden rounded-b-[32px] bg-paper2">
          <Image
            source={require('../../assets/welcome-hero.jpg')}
            className="h-full w-full"
            resizeMode="cover"
            accessibilityLabel={t('welcome.heroA11y')}
          />
        </View>
      </View>

      <SafeAreaView className="flex-1">
        <View className="flex-1 px-6">
          {/* Wordmark par-dessus le haut de l'image (mur crème clair) */}
          <View className="items-center pt-8">
            <Text
              className="font-heading-bold text-2xl uppercase tracking-[6px] text-ink"
              style={{ textShadowColor: 'rgba(245,243,236,0.9)', textShadowRadius: 10 }}
            >
              {t('welcome.wordmark')}
            </Text>
          </View>

          {/* Pousse le bloc titre/actions en bas, sur le crème */}
          <View className="flex-1" />

          <View className="pb-6">
            <Text className="font-heading-bold text-4xl leading-tight text-ink">
              {t('welcome.heading')}
            </Text>
            <Text className="mt-3 font-body text-base leading-6 text-gray2">
              {t('welcome.subtitle')}
            </Text>
          </View>

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
    </View>
  );
}
