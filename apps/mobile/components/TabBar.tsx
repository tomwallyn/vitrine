import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useActiveGenerationCount } from '@/lib/generation-tracker';
import { colors } from '@vitrine/shared';

type IoniconName = keyof typeof Ionicons.glyphMap;

/** Icônes par onglet : filled quand actif, outline quand inactif. */
const TAB_ICONS: Record<string, { active: IoniconName; inactive: IoniconName }> = {
  index: { active: 'home', inactive: 'home-outline' },
  gallery: { active: 'images', inactive: 'images-outline' },
  credits: { active: 'diamond', inactive: 'diamond-outline' },
  profile: { active: 'person', inactive: 'person-outline' },
};

/**
 * Tab bar custom VITRINE — charte N&B « chaud » :
 * fond blanc, fine bordure haute crème, ombre très légère, safe-area bottom,
 * onglet actif = icône filled encre sur pastille crème + label Manrope 600.
 */
export function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  // Pastille sur l'onglet Galerie quand des générations tournent en fond.
  const activeGenerationCount = useActiveGenerationCount();

  return (
    <View
      className="flex-row border-t border-paper3 bg-white px-2 pt-2"
      style={{
        paddingBottom: Math.max(insets.bottom, 10),
        shadowColor: colors.ink,
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.05,
        shadowRadius: 12,
        elevation: 10,
      }}
    >
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const focused = state.index === index;
        const label =
          typeof options.tabBarLabel === 'string'
            ? options.tabBarLabel
            : (options.title ?? route.name);
        const icons = TAB_ICONS[route.name] ?? {
          active: 'ellipse' as IoniconName,
          inactive: 'ellipse-outline' as IoniconName,
        };

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!focused && !event.defaultPrevented) {
            navigation.navigate(route.name, route.params);
          }
        };

        const onLongPress = () => {
          navigation.emit({ type: 'tabLongPress', target: route.key });
        };

        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
            testID={options.tabBarButtonTestID}
            onPress={onPress}
            onLongPress={onLongPress}
            hitSlop={6}
            className="flex-1 items-center gap-1 py-1"
          >
            {/* Pastille crème arrondie sous l'icône active */}
            <View
              className={`h-8 w-16 items-center justify-center rounded-full ${
                focused ? 'bg-paper2' : 'bg-transparent'
              }`}
            >
              <Ionicons
                name={focused ? icons.active : icons.inactive}
                size={21}
                color={focused ? colors.ink : colors.gray}
              />
              {/* Point « génération en cours » sur l'onglet Galerie */}
              {route.name === 'gallery' && activeGenerationCount > 0 ? (
                <View className="absolute right-3.5 top-0.5 h-2 w-2 rounded-full border border-white bg-ink" />
              ) : null}
            </View>
            <Text
              className={`font-body-semibold text-[11px] ${focused ? 'text-ink' : 'text-gray'}`}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
