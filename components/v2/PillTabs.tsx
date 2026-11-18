import { useEffect, useState } from 'react';
import { Text, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { color, motion, radius, shadow } from '../../theme/v2';
import { Press } from './Press';

export interface PillTabItem<K extends string> {
  key: K;
  label: string;
}

export interface PillTabsProps<K extends string> {
  items: readonly PillTabItem<K>[];
  value: K;
  onChange: (key: K) => void;
  style?: StyleProp<ViewStyle>;
}

type Box = { x: number; w: number };
const PAD = 4;

/**
 * Grey track r999 padding 4; items flex 1, 36 high, 600 15 ink, 700 white when selected.
 * One blue glowing pill sized to the selected item by measurement; left and width slide 300ms.
 */
export function PillTabs<K extends string>({ items, value, onChange, style }: PillTabsProps<K>) {
  const [boxes, setBoxes] = useState<Partial<Record<K, Box>>>({});
  const left = useSharedValue(PAD);
  const width = useSharedValue(0);
  const placed = useSharedValue(false);
  const box = boxes[value];

  useEffect(() => {
    if (!box) return;
    if (placed.get()) {
      left.set(withTiming(box.x, { duration: motion.pill, easing: motion.tabEase }));
      width.set(withTiming(box.w, { duration: motion.pill, easing: motion.tabEase }));
    } else {
      left.set(box.x);
      width.set(box.w);
      placed.set(true);
    }
  }, [box, left, width, placed]);

  const pill = useAnimatedStyle(() => ({ left: left.get(), width: width.get(), opacity: placed.get() ? 1 : 0 }));

  return (
    <View style={[{ flexDirection: 'row', backgroundColor: color.segTrack, borderRadius: radius.pill, padding: PAD }, style]}>
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: PAD, bottom: PAD, borderRadius: radius.pill, backgroundColor: color.blue, ...shadow.glow }, pill]} />
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
            style={{ flex: 1, height: 36, paddingHorizontal: 4, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: on ? '700' : '600', color: on ? color.white : color.ink }}>
              {o.label}
            </Text>
          </Press>
        );
      })}
    </View>
  );
}
