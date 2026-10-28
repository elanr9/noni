import { useEffect, useState } from 'react';
import { Text, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { color, motion, radius } from '../../theme/v2';
import { Press } from './Press';

export interface UnderlineTabItem<K extends string> {
  key: K;
  label: string;
  count?: number;
}

export interface UnderlineTabsProps<K extends string> {
  items: readonly UnderlineTabItem<K>[];
  value: K;
  onChange: (key: K) => void;
  /** Label size; 16 by default, 18 in the Analytics header. */
  size?: number;
  /** Hide the grey-2 hairline along the bottom. */
  hairline?: boolean;
  style?: StyleProp<ViewStyle>;
}

type Box = { x: number; w: number };

/**
 * Text tabs with one sliding indicator. Row, gap 22, hairline under; items 40 high, 600 grey-4,
 * 700 blue-deep when selected; the 3px blue bar measures the selected item and slides 280ms.
 */
export function UnderlineTabs<K extends string>({ items, value, onChange, size = 16, hairline = true, style }: UnderlineTabsProps<K>) {
  const [boxes, setBoxes] = useState<Partial<Record<K, Box>>>({});
  const left = useSharedValue(0);
  const width = useSharedValue(0);
  const placed = useSharedValue(false);
  const box = boxes[value];

  useEffect(() => {
    if (!box) return;
    if (placed.get()) {
      left.set(withTiming(box.x, { duration: motion.underline, easing: motion.tabEase }));
      width.set(withTiming(box.w, { duration: motion.underline, easing: motion.tabEase }));
    } else {
      left.set(box.x);
      width.set(box.w);
      placed.set(true);
    }
  }, [box, left, width, placed]);

  const indicator = useAnimatedStyle(() => ({ left: left.get(), width: width.get(), opacity: placed.get() ? 1 : 0 }));

  return (
    <View style={[{ flexDirection: 'row', gap: 22, borderBottomWidth: hairline ? 1 : 0, borderBottomColor: color.grey2 }, style]}>
      {items.map((o) => {
        const on = o.key === value;
        return (
          <Press
            key={o.key}
            onPress={() => {
              if (!on) onChange(o.key);
            }}
            haptic={!on}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onLayout={(e: LayoutChangeEvent) => {
              const { x, width: w } = e.nativeEvent.layout;
              setBoxes((prev) => (prev[o.key]?.x === x && prev[o.key]?.w === w ? prev : { ...prev, [o.key]: { x, w } }));
            }}
            style={{ height: 40, flexDirection: 'row', alignItems: 'center', gap: 6 }}
          >
            <Text numberOfLines={1} style={{ fontSize: size, lineHeight: Math.round(size * 1.25), fontWeight: on ? '700' : '600', color: on ? color.blueDeep : color.grey4 }}>
              {o.label}
            </Text>
            {o.count !== undefined ? (
              <View style={{ minWidth: 20, height: 20, paddingHorizontal: 6, borderRadius: radius.pill, backgroundColor: on ? color.blue : color.grey2, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 12, lineHeight: 20, fontWeight: '700', color: on ? color.white : color.grey4, fontVariant: ['tabular-nums'] }}>{o.count}</Text>
              </View>
            ) : null}
          </Press>
        );
      })}
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', bottom: 0, height: 3, borderRadius: 3, backgroundColor: color.blue }, indicator]} />
    </View>
  );
}
