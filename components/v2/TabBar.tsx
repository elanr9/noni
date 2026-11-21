import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { color, motion, radius } from '../../theme/v2';
import { WAIT_RED } from '../shared/WaitBadge';
import { Icon, type IconName } from './Icon';
import { Press } from './Press';

/** Bar body above the home indicator. */
const BODY = 54;
const CREATE = 44;

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
  /** Entries in display order; the Create entry is the centred action, with up to three routes either side. */
  entries: TabBarEntry[];
  onCreate: () => void;
  /** Count badges by route name, on top of any tabBarBadge option. */
  counts?: Record<string, number | undefined>;
  /** Red dot by route name: something waits elsewhere (another company or side). Shown when there is no count. */
  dots?: Record<string, boolean | undefined>;
}

/**
 * v2 shell bar: a flat white bar with a hairline on top and five equal columns. The active
 * tab is ink, the rest grey; Create is a flat blue disc in the middle of the row and the only
 * blue shape on the bar besides a count.
 */
export function TabBar({ state, descriptors, emitter, navigateToTab, entries, onCreate, counts, dots }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const H = tabBarHeight(insets.bottom);
  const activeName = state.routes[state.index]?.name;

  // Create stays dead centre whatever sits either side of it: the routes before it share the
  // left of the bar and the routes after it share the right. Two and two is five equal columns.
  const createAt = entries.findIndex((e) => e.kind === 'create');
  const createEntry = createAt >= 0 ? entries[createAt] : null;
  const routes = (list: TabBarEntry[]) => list.filter((e): e is Extract<TabBarEntry, { kind: 'route' }> => e.kind === 'route');
  const left = routes(createAt >= 0 ? entries.slice(0, createAt) : entries);
  const right = routes(createAt >= 0 ? entries.slice(createAt + 1) : []);

  const renderRoute = (entry: Extract<TabBarEntry, { kind: 'route' }>) => {
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
  };

  return (
    <View style={[styles.bar, { height: H }]}>
      <View style={styles.row}>
        <View style={styles.side}>{left.map(renderRoute)}</View>
        {createEntry ? (
          <View style={styles.createSlot}>
            <CreateButton label={createEntry.label} onPress={onCreate} />
          </View>
        ) : null}
        <View style={styles.side}>{right.map(renderRoute)}</View>
      </View>
    </View>
  );
}

function TabItem({ icon, label, on, count, dot, onPress }: { icon: IconName; label: string; on: boolean; count?: number; dot?: boolean; onPress: () => void }) {
  const fg = on ? color.tabActive : color.tabInactive;
  return (
    <Press
      accessibilityRole="tab"
      accessibilityLabel={count ? `${label}, ${count} waiting` : dot ? `${label}, waiting elsewhere` : label}
      accessibilityState={{ selected: on }}
      scaleTo={0.92}
      onPress={onPress}
      style={styles.item}
    >
      <View>
        <Icon name={icon} size={24} weight={on ? 700 : 500} color={fg} />
        {count ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{count > 99 ? '99+' : count}</Text>
          </View>
        ) : dot ? (
          <View style={styles.dot} />
        ) : null}
      </View>
      <Text numberOfLines={1} style={[styles.label, { color: fg, fontWeight: on ? '700' : '500' }]}>
        {label}
      </Text>
    </Press>
  );
}

function CreateButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <View style={styles.createItem}>
      <Press accessibilityRole="button" accessibilityLabel={label} scaleTo={0.92} hitSlop={8} onPress={onPress} style={styles.create}>
        <Icon name="add" size={26} weight={700} color={color.white} />
      </Press>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 100, backgroundColor: color.card, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.grey2 },
  row: { flexDirection: 'row', height: BODY },
  side: { flex: 1, flexDirection: 'row' },
  createSlot: { width: '20%' },
  createItem: { height: BODY, alignItems: 'center', justifyContent: 'center' },
  item: { flex: 1, height: BODY, alignItems: 'center', justifyContent: 'center', gap: 3 },
  label: { fontSize: 10.5, lineHeight: 13 },
  badge: { position: 'absolute', top: -5, right: -11, minWidth: 17, height: 17, paddingHorizontal: 4, borderRadius: radius.pill, backgroundColor: color.blue, borderWidth: 1.5, borderColor: color.card, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 10, lineHeight: 13, fontWeight: '700', color: color.white, fontVariant: ['tabular-nums'] },
  dot: { position: 'absolute', top: -2, right: -4, width: 9, height: 9, borderRadius: radius.pill, backgroundColor: WAIT_RED, borderWidth: 1.5, borderColor: color.card },
  create: { width: CREATE, height: CREATE, borderRadius: radius.pill, backgroundColor: color.blue, alignItems: 'center', justifyContent: 'center' },
});

export { motion as tabBarMotion };
