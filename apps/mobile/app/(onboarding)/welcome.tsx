import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { t } from '@/lib/i18n';

/** 01 — ACCUEIL : image hero plein écran + dégradé chaud → « Une photo. Une vitrine pro. » */
export default function WelcomeScreen() {
  const router = useRouter();

  return (
    <View className="flex-1 bg-ink">
      {/* Image plein écran */}
      <Image
        source={require('../../assets/welcome-hero.jpg')}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
        accessibilityLabel={t('welcome.heroA11y')}
      />
      {/* Dégradé d'ombre chaud en bas : garde le haut clair (wordmark encre) et
          assombrit le bas pour la lisibilité des textes/boutons blancs. */}
      <LinearGradient
        colors={['transparent', 'transparent', 'rgba(26,18,12,0.6)', 'rgba(14,9,5,0.96)']}
        locations={[0, 0.35, 0.65, 1]}
        style={StyleSheet.absoluteFill}
      />

      <SafeAreaView className="flex-1">
        <View className="flex-1 px-6 pb-4">
          {/* Wordmark en haut (encre, sur le mur crème clair) */}
          <Text className="pt-6 font-heading-bold text-2xl uppercase tracking-[6px] text-ink">
            {t('welcome.wordmark')}
          </Text>

          <View className="flex-1" />

          {/* Tagline */}
          <View className="mb-5 self-start rounded-full border border-offwhite/40 px-4 py-2">
            <Text className="font-heading text-[11px] uppercase tracking-[2px] text-offwhite/90">
              {t('welcome.tagline')}
            </Text>
          </View>

          {/* Titre + pitch (blanc sur l'ombre) */}
          <Text className="font-heading-bold text-5xl leading-[1.05] text-offwhite">
            {t('welcome.heading')}
          </Text>
          <Text className="mt-4 font-body text-base leading-6 text-offwhite/85">
            {t('welcome.subtitle')}
          </Text>

          {/* Actions */}
          <View className="mt-7">
            <Button
              variant="light"
              label={t('welcome.ctaStart')}
              onPress={() => router.push('/(auth)/sign-up')}
            />
            <Pressable
              accessibilityRole="button"
              className="mt-2 py-3"
              onPress={() => router.push('/(auth)/sign-in')}
            >
              <Text className="text-center font-heading text-base tracking-wide text-offwhite">
                {t('welcome.ctaHaveAccount')}
              </Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}
