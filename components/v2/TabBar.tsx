import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { color, motion, radius, shadow } from '../../theme/v2';
import { WAIT_RED } from '../shared/WaitBadge';
import { Icon, type IconName } from './Icon';
import { Press } from './Press';
import { tap } from './haptics';

/** Bar body above the home indicator. */
const BODY = 54;
const CREATE = 46;
const SPRING = Easing.bezier(0.22, 1.2, 0.36, 1);

/** Full bar height for a bottom inset: 88 on a phone with a home indicator. */
export function tabBarHeight(bottomInset: number): number {
  return BODY + Math.max(bottomInset, 14);
}

/** Bottom inset a tab root screen keeps clear: the bar plus 24. */
export function useTabBarInset(): number {
  const insets = useSafeAreaInsets();
  return tabBarHeight(insets.bottom) + 24;
}

export type TabBarEntry =
  | { kind: 'route'; name: string; icon: IconName; label: string }
  | { kind: 'create'; label: string };

export interface TabBarProps extends BottomTabBarProps {
  /** Five entries in display order; the Create entry is the raised action. */
  entries: TabBarEntry[];
  onCreate: () => void;
  /** Count badges by route name, on top of any tabBarBadge option. */
  counts?: Record<string, number | undefined>;
  /** Red dot by route name: something waits elsewhere (another company or side). Shown when there is no count. */
  dots?: Record<string, boolean | undefined>;
}

/**
 * v2 shell bar: a flat white bar with a hairline on top and five equal columns. The active
 * tab is told by colour alone; Create is a blue disc sitting in the middle of the row.
 */
export function TabBar({ state, descriptors, emitter, navigateToTab, entries, onCreate, counts, dots }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const H = tabBarHeight(insets.bottom);
  const activeName = state.routes[state.index]?.name;

  return (
    <View style={[styles.bar, { height: H }]}>
      <View style={styles.row}>
        {entries.map((entry) => {
          if (entry.kind === 'create') {
            return <CreateButton key="create" label={entry.label} onPress={onCreate} />;
          }
          const route = state.routes.find((r) => r.name === entry.name);
          if (!route) return <View key={entry.name} style={styles.item} />;
          const on = route.name === activeName;
          const badge = descriptors[route.key]?.options.tabBarBadge;
          const count = counts?.[entry.name] ?? (typeof badge === 'number' ? badge : undefined);
          // Tapping the active tab still emits tabPress: its root scrolls to top (useScrollToTop).
          const onPress = () => {
            const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!on && !event.defaultPrevented) navigateToTab(route.key);
          };
          return <TabItem key={entry.name} icon={entry.icon} label={entry.label} on={on} count={count} dot={!!dots?.[entry.name]} onPress={onPress} />;
        })}
      </View>
    </View>
  );
}

function TabItem({ icon, label, on, count, dot, onPress }: { icon: IconName; label: string; on: boolean; count?: number; dot?: boolean; onPress: () => void }) {
  const fg = on ? color.tabActive : color.tabInactive;
  const pop = useSharedValue(1);
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.get() }] }));
  return (
    <Press
      accessibilityRole="tab"
      accessibilityLabel={count ? `${label}, ${count} waiting` : dot ? `${label}, waiting elsewhere` : label}
      accessibilityState={{ selected: on }}
      scaleTo={1}
      onPress={() => {
        pop.set(withSequence(withTiming(1.1, { duration: 120, easing: SPRING }), withTiming(1, { duration: 240, easing: SPRING })));
        onPress();
      }}
      style={styles.item}
    >
      <Animated.View style={popStyle}>
        <Icon name={icon} size={24} weight={on ? 700 : 500} color={fg} />
        {count ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{count > 99 ? '99+' : count}</Text>
          </View>
        ) : dot ? (
          <View style={styles.dot} />
        ) : null}
      </Animated.View>
      <Text numberOfLines={1} style={[styles.label, { color: fg, fontWeight: on ? '700' : '500' }]}>
        {label}
      </Text>
    </Press>
  );
}

function CreateButton({ label, onPress }: { label: string; onPress: () => void }) {
  const pressed = useSharedValue(0);
  // Spec: the disc scales to 0.94 on press.
  const disc = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - 0.06 * pressed.get() }],
  }));
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={label}
      scaleTo={1}
      haptic={false}
      onPressIn={() => pressed.set(withTiming(1, { duration: motion.press, easing: motion.ease }))}
      onPressOut={() => pressed.set(withTiming(0, { duration: 220, easing: SPRING }))}
      onPress={() => {
        tap();
        onPress();
      }}
      style={styles.item}
    >
      <Animated.View style={[styles.create, disc]}>
        <Icon name="add" size={28} weight={700} color={color.white} />
      </Animated.View>
    </Press>
  );
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 100, backgroundColor: color.card, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.grey2 },
  row: { flexDirection: 'row', height: BODY },
  item: { flex: 1, height: BODY, alignItems: 'center', justifyContent: 'center', gap: 3 },
  label: { fontSize: 11, lineHeight: 13, letterSpacing: 0.1 },
  badge: { position: 'absolute', top: -5, right: -11, minWidth: 17, height: 17, paddingHorizontal: 4, borderRadius: radius.pill, backgroundColor: color.blue, borderWidth: 1.5, borderColor: color.card, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 10, lineHeight: 13, fontWeight: '700', color: color.white, fontVariant: ['tabular-nums'] },
  dot: { position: 'absolute', top: -2, right: -4, width: 9, height: 9, borderRadius: radius.pill, backgroundColor: WAIT_RED, borderWidth: 1.5, borderColor: color.card },
  create: { width: CREATE, height: CREATE, borderRadius: radius.pill, backgroundColor: color.blue, alignItems: 'center', justifyContent: 'center', ...shadow.glow },
});

export { motion as tabBarMotion };
