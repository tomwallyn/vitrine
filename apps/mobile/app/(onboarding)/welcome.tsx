import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Image, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { t } from '@/lib/i18n';

/** Fond sombre chaud dans lequel l'image se fond (= bas de l'écran + fin du dégradé). */
const WARM_DARK = '#171009';

/** 01 — ACCUEIL : image hero pleine largeur (ratio naturel, sans zoom) fondue dans un bas sombre. */
export default function WelcomeScreen() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  // Pleine largeur au ratio naturel 3:4 → aucun recadrage/zoom (plafonné sur petits écrans).
  const imageHeight = Math.min(width * (4 / 3), height * 0.72);

  return (
    <View className="flex-1" style={{ backgroundColor: WARM_DARK }}>
      {/* Image pleine largeur, ancrée en haut */}
      <Image
        source={require('../../assets/welcome-hero.jpg')}
        style={{ position: 'absolute', top: 0, left: 0, width, height: imageHeight }}
        resizeMode="cover"
        accessibilityLabel={t('welcome.heroA11y')}
      />
      {/* Dégradé : haut clair (wordmark encre) → se fond dans le sombre chaud au bas de l'image,
          en continuité avec le fond → pas de couture visible. */}
      <LinearGradient
        colors={['transparent', 'transparent', 'rgba(23,16,9,0.5)', WARM_DARK]}
        locations={[0, 0.45, 0.78, 1]}
        style={{ position: 'absolute', top: 0, left: 0, width, height: imageHeight }}
      />

      <SafeAreaView className="flex-1">
        <View className="flex-1 px-6 pb-4">
          {/* Wordmark en haut-gauche (encre, sur le mur crème clair) */}
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
