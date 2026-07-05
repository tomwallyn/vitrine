import { Tabs } from 'expo-router';

import { TabBar } from '@/components/TabBar';
import { t } from '@/lib/i18n';
import { colors } from '@vitrine/shared';

/** Tab bar 4 onglets : Accueil · Galerie · Crédits · Profil (custom, cf. TabBar). */
export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.paper },
      }}
    >
      <Tabs.Screen name="index" options={{ title: t('tabsLayout.home') }} />
      <Tabs.Screen name="gallery" options={{ title: t('tabsLayout.gallery') }} />
      <Tabs.Screen name="credits" options={{ title: t('tabsLayout.credits') }} />
      <Tabs.Screen name="profile" options={{ title: t('tabsLayout.profile') }} />
    </Tabs>
  );
}
