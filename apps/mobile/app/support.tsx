import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/ScreenHeader';
import { t } from '@/lib/i18n';
import { colors } from '@vitrine/shared';

/** Adresse de contact support — à faire pointer vers la vraie boîte en M6b. */
const SUPPORT_EMAIL = 'support@vitrine.app';

const APP_VERSION = Constants.expoConfig?.version ?? '0.1.0';

/**
 * Aide & support (menu Profil) : contact email, version de l'app, note RGPD.
 * CGU et politique de confidentialité sont annoncées « Bientôt » tant que les
 * documents ne sont pas publiés (pas de lien fantôme).
 */
export default function SupportScreen() {
  const contactSupport = async () => {
    const url = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
      t('support.emailSubject', { version: APP_VERSION }),
    )}`;
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert(t('support.emailUnavailableTitle'), t('support.emailUnavailableMessage', { email: SUPPORT_EMAIL }));
    }
  };

  const rows: {
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    hint?: string;
    onPress?: () => void;
    soon?: boolean;
  }[] = [
    {
      icon: 'mail-outline',
      label: t('support.contactLabel'),
      hint: SUPPORT_EMAIL,
      onPress: () => void contactSupport(),
    },
    { icon: 'document-text-outline', label: t('support.termsLabel'), soon: true },
    { icon: 'shield-checkmark-outline', label: t('support.privacyLabel'), soon: true },
  ];

  return (
    <SafeAreaView className="flex-1 bg-paper">
      <ScreenHeader title={t('support.title')} />
      <ScrollView className="flex-1 px-5" contentContainerClassName="pt-2 pb-8">
        <Text className="font-heading-bold text-3xl text-ink">{t('support.heading')}</Text>
        <Text className="mt-2 font-body text-base text-gray2">
          {t('support.subtitle')}
        </Text>

        <View className="mt-8 overflow-hidden rounded-3xl border border-paper3 bg-white">
          {rows.map((row, i) => (
            <Pressable
              key={row.label}
              accessibilityRole="button"
              disabled={!row.onPress}
              onPress={row.onPress}
              className={`flex-row items-center gap-3 px-5 py-4 ${
                row.onPress ? 'active:bg-paper2' : 'opacity-60'
              } ${i > 0 ? 'border-t border-paper2' : ''}`}
            >
              <Ionicons name={row.icon} size={20} color={colors.gray3} />
              <View className="flex-1">
                <Text className="font-body-semibold text-sm text-ink">{row.label}</Text>
                {row.hint ? <Text className="font-body text-xs text-gray">{row.hint}</Text> : null}
              </View>
              {row.soon ? (
                <View className="rounded-full bg-paper2 px-3 py-1">
                  <Text className="font-body-semibold text-[10px] uppercase tracking-widest text-gray2">
                    {t('support.comingSoon')}
                  </Text>
                </View>
              ) : (
                <Ionicons name="chevron-forward" size={16} color={colors.gray} />
              )}
            </Pressable>
          ))}
        </View>

        {/* Confidentialité — purge RGPD des photos sources (infra/gcs) */}
        <View className="mt-4 rounded-3xl border border-paper3 bg-paper2 px-5 py-4">
          <Text className="font-body-semibold text-sm text-ink">{t('support.photosCardTitle')}</Text>
          <Text className="mt-1 font-body text-xs text-gray2">
            {t('support.photosCardBody')}
          </Text>
        </View>

        <Text className="mt-8 text-center font-body text-xs text-gray">
          {t('support.footerVersion', { version: APP_VERSION })}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
