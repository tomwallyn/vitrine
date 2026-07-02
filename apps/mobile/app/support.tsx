import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/ScreenHeader';
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
      `VITRINE ${APP_VERSION} — demande de support`,
    )}`;
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('Email indisponible', `Écrivez-nous à ${SUPPORT_EMAIL}`);
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
      label: 'Nous contacter',
      hint: SUPPORT_EMAIL,
      onPress: () => void contactSupport(),
    },
    { icon: 'document-text-outline', label: "Conditions d'utilisation", soon: true },
    { icon: 'shield-checkmark-outline', label: 'Politique de confidentialité', soon: true },
  ];

  return (
    <SafeAreaView className="flex-1 bg-paper">
      <ScreenHeader title="Aide & support" />
      <ScrollView className="flex-1 px-5" contentContainerClassName="pt-2 pb-8">
        <Text className="font-heading-bold text-3xl text-ink">Besoin d{"'"}aide ?</Text>
        <Text className="mt-2 font-body text-base text-gray2">
          Une question, un rendu raté, un souci de crédits — écrivez-nous, on répond vite.
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
                    Bientôt
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
          <Text className="font-body-semibold text-sm text-ink">Vos photos</Text>
          <Text className="mt-1 font-body text-xs text-gray2">
            Les photos sources envoyées pour un rendu sont supprimées automatiquement de nos
            serveurs après 30 jours. Les visuels générés (mannequins synthétiques) restent dans
            votre galerie.
          </Text>
        </View>

        <Text className="mt-8 text-center font-body text-xs text-gray">
          VITRINE {APP_VERSION}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
