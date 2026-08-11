import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { BlurView } from 'expo-blur';
import { StyleSheet, Text, View } from 'react-native';

import { color, shadow } from '../../theme/tokens';
import { Icon, type IconName } from './Icon';
import { PressableScale } from './PressableScale';

const ITEMS: Record<string, { icon: IconName; label: string }> = {
  index: { icon: 'house', label: 'Home' },
  posts: { icon: 'layout-list', label: 'Posts' },
  analytics: { icon: 'chart-column', label: 'Analytics' },
  profile: { icon: 'circle-user-round', label: 'Profile' },
};

type TabBarProps = BottomTabBarProps & {
  items?: Record<string, { icon: IconName; label: string }>;
  /**
   * Setup gate (1c): dim and disable only `lockedRoutes`.
   * Other tabs (e.g. Profile) stay tappable.
   */
  locked?: boolean;
  lockedRoutes?: string[];
};

/** Floating tab bar. Pass to expo-router: `<Tabs tabBar={(p) => <TabBar {...p} />}>`. Defaults to the creator item map; pass `items` for other route groups. */
export function TabBar({
  state,
  descriptors,
  navigation,
  items = ITEMS,
  locked = false,
  lockedRoutes = ['index', 'posts', 'analytics'],
}: TabBarProps) {
  return (
    <View style={[styles.wrap, shadow.shadowFloat]} pointerEvents="box-none">
      <View style={styles.clip} pointerEvents="auto">
        <BlurView intensity={40} tint="light" style={StyleSheet.absoluteFill} />
        <View style={styles.row}>
          {state.routes.map((route, index) => {
            const item = items[route.name];
            if (item === undefined) return null;
            const active = state.index === index;
            const badge = descriptors[route.key]?.options.tabBarBadge;
            const routeLocked = locked && lockedRoutes.includes(route.name);

            const onPress = () => {
              if (routeLocked) return;
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (!active && !event.defaultPrevented) {
                navigation.navigate(route.name);
              }
            };

            return (
              <PressableScale
                key={route.key}
                accessibilityRole="tab"
                accessibilityState={{ selected: active, disabled: routeLocked }}
                accessibilityLabel={item.label}
                disabled={routeLocked}
                onPress={onPress}
                style={[
                  styles.item,
                  active && styles.itemActive,
                  routeLocked && styles.itemLocked,
                ]}
              >
                <View>
                  <Icon
                    name={item.icon}
                    size={22}
                    color={
                      routeLocked
                        ? color.slate300
                        : active
                          ? color.blue600
                          : color.slate400
                    }
                  />
                  {badge !== undefined && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{badge}</Text>
                    </View>
                  )}
                </View>
                <Text
                  style={[
                    styles.label,
                    {
                      color: routeLocked
                        ? color.slate300
                        : active
                          ? color.blue700
                          : color.textSubtle,
                    },
                  ]}
                >
                  {item.label}
                </Text>
              </PressableScale>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 22,
    borderRadius: 999,
  },
  itemLocked: {
    opacity: 0.45,
  },
  clip: {
    borderRadius: 999,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: color.line,
    backgroundColor: color.glass,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    gap: 4,
    padding: 8,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 999,
  },
  itemActive: {
    backgroundColor: color.blue100,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -7,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 999,
    backgroundColor: color.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: color.white,
    fontSize: 10,
    fontWeight: '800',
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
  },
});
