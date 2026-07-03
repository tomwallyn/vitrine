import { Tabs } from 'expo-router';

import { TabBar } from '@/components/TabBar';
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
      <Tabs.Screen name="index" options={{ title: 'Accueil' }} />
      <Tabs.Screen name="gallery" options={{ title: 'Galerie' }} />
      <Tabs.Screen name="credits" options={{ title: 'Crédits' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profil' }} />
    </Tabs>
  );
}
