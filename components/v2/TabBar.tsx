import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { color, motion, radius } from '../../theme/v2';
import { Icon, type IconName } from './Icon';
import { Press } from './Press';
import { tap } from './haptics';

/** Bar body above the home indicator. */
const BODY = 50;
/** Room the raised Create button needs above the bar. */
const APRON = 40;
const CREATE = 64;
const SPRING = Easing.bezier(0.22, 1.2, 0.36, 1);

/** Full bar height for a bottom inset: 84 on a phone with a home indicator. */
export function tabBarHeight(bottomInset: number): number {
  return BODY + Math.max(bottomInset, 14);
}

/** Bottom inset a tab root screen keeps clear: the bar plus 36. */
export function useTabBarInset(): number {
  const insets = useSafeAreaInsets();
  return tabBarHeight(insets.bottom) + 36;
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
}

/** Notch: 72 wide, 32 deep, 12px eased shoulders, top corners r24, one continuous path. */
function notchPath(W: number, H: number): string {
  const cx = W / 2, nw = 72, nd = 32, sh = 12, cr = 24;
  const l = cx - nw / 2, r = cx + nw / 2;
  return [
    `M0 ${cr}`, `A${cr} ${cr} 0 0 1 ${cr} 0`, `H${l - sh}`,
    `C${l - sh / 3} 0 ${l - sh / 3} 4 ${l} 6`,
    `C${l + 4} ${nd * 0.7} ${l + nw * 0.25} ${nd} ${cx} ${nd}`,
    `C${r - nw * 0.25} ${nd} ${r - 4} ${nd * 0.7} ${r} 6`,
    `C${r + sh / 3} 4 ${r + sh / 3} 0 ${r + sh} 0`,
    `H${W - cr}`, `A${cr} ${cr} 0 0 1 ${W} ${cr}`, `V${H + 60}H0Z`,
  ].join(' ');
}

/**
 * v2 shell bar: white with a notch under the raised blue Create button, five equal columns,
 * a blue-tint pill sliding behind the active item on a spring. Absolute at the bottom; the
 * 40px apron above it only catches taps on the Create button.
 */
export function TabBar({ state, descriptors, navigation, entries, onCreate, counts }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const H = tabBarHeight(insets.bottom);
  const [W, setW] = useState(0);
  const n = entries.length;
  const colW = W / Math.max(1, n);
  const activeName = state.routes[state.index]?.name;
  const activeIdx = entries.findIndex((e) => e.kind === 'route' && e.name === activeName);

  const pillX = useSharedValue(0);
  const placed = useSharedValue(false);
  useEffect(() => {
    if (!colW || activeIdx < 0) return;
    const target = (activeIdx + 0.5) * colW - 32;
    pillX.set(placed.get() ? withTiming(target, { duration: 260, easing: SPRING }) : target);
    placed.set(true);
  }, [activeIdx, colW, pillX, placed]);
  const pill = useAnimatedStyle(() => ({ transform: [{ translateX: pillX.get() }], opacity: placed.get() && activeIdx >= 0 ? 1 : 0 }));

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { height: H + APRON }]}>
      <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={[styles.bar, { height: H }]}>
        {W > 0 ? (
          <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={StyleSheet.absoluteFill}>
            <Path d={notchPath(W, H)} fill={color.card} />
          </Svg>
        ) : null}
        <Animated.View pointerEvents="none" style={[styles.pill, pill]} />
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
            const onPress = () => {
              const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!on && !event.defaultPrevented) navigation.navigate(route.name);
            };
            return <TabItem key={entry.name} icon={entry.icon} label={entry.label} on={on} count={count} onPress={onPress} />;
          })}
        </View>
      </View>
    </View>
  );
}

function TabItem({ icon, label, on, count, onPress }: { icon: IconName; label: string; on: boolean; count?: number; onPress: () => void }) {
  const fg = on ? color.tabActive : color.tabInactive;
  const pop = useSharedValue(1);
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.get() }, { translateY: (1 - pop.get()) * 7 }] }));
  return (
    <Press
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: on }}
      scaleTo={1}
      onPress={() => {
        pop.set(withSequence(withTiming(1.14, { duration: 120, easing: SPRING }), withTiming(1, { duration: 240, easing: SPRING })));
        onPress();
      }}
      style={styles.item}
    >
      <Animated.View style={popStyle}>
        <Icon name={icon} size={26} color={fg} />
        {count ? (
          <View style={[styles.badge, { backgroundColor: on ? color.tabActive : color.blue }]}>
            <Text style={styles.badgeText}>{count > 99 ? '99+' : count}</Text>
          </View>
        ) : null}
      </Animated.View>
      <Text numberOfLines={1} style={[styles.label, { color: fg, fontWeight: on ? '700' : '600' }]}>
        {label}
      </Text>
    </Press>
  );
}

function CreateButton({ label, onPress }: { label: string; onPress: () => void }) {
  const pressed = useSharedValue(0);
  const disc = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - 0.12 * pressed.get() }, { rotate: `${45 * pressed.get()}deg` }],
  }));
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={label}
      scaleTo={1}
      haptic={false}
      onPressIn={() => pressed.set(withTiming(1, { duration: 220, easing: SPRING }))}
      onPressOut={() => pressed.set(withTiming(0, { duration: 220, easing: SPRING }))}
      onPress={() => {
        tap();
        onPress();
      }}
      style={[styles.item, { marginTop: -APRON, paddingTop: 0, height: BODY + APRON, justifyContent: 'flex-start' }]}
    >
      <Animated.View style={[styles.create, disc]}>
        <Icon name="add" size={30} weight={700} color={color.white} />
      </Animated.View>
      <Text style={[styles.label, { color: color.blue, fontWeight: '600', marginTop: 10 }]}>{label}</Text>
    </Press>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 100 },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, overflow: 'visible', boxShadow: '0 -2px 12px rgba(0,0,0,0.06)' },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  item: { flex: 1, alignItems: 'center', paddingTop: 10, gap: 4, height: BODY },
  pill: { position: 'absolute', top: 4, left: 0, width: 64, height: 60, borderRadius: radius.pill, backgroundColor: color.blueTint },
  label: { fontSize: 12, lineHeight: 14 },
  badge: { position: 'absolute', top: -6, right: -10, minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: radius.pill, borderWidth: 2, borderColor: color.white, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 11, lineHeight: 14, fontWeight: '700', color: color.white },
  create: {
    width: CREATE,
    height: CREATE,
    borderRadius: radius.pill,
    backgroundColor: color.blue,
    borderWidth: 5,
    borderColor: color.white,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 6px 18px rgba(27,166,238,0.38)',
  },
});

export { motion as tabBarMotion };
