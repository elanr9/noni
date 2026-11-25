import { useEffect, useState } from 'react';
import { Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { color, control, motion, radius, shadow, tone as tones, type Tone } from '../../theme/v2';
import { Press } from './Press';

export interface SegOption<K extends string> {
  key: K;
  label: string;
  count?: number;
  /** Count badge tone when unselected. */
  tone?: Tone;
}

export interface SegProps<K extends string> {
  options: readonly SegOption<K>[];
  value: K;
  onChange: (key: K) => void;
  style?: StyleProp<ViewStyle>;
}

const PAD = 4;

/** Pill group with a sliding blue indicator on the push timing. Counts sit in tinted badges. */
export function Seg<K extends string>({ options, value, onChange, style }: SegProps<K>) {
  const [width, setWidth] = useState(0);
  const n = options.length;
  // Four across: tighter type so a label and its count still fit a phone.
  const tight = n > 3;
  const index = Math.max(0, options.findIndex((o) => o.key === value));
  const itemW = width > 0 ? (width - PAD * 2) / n : 0;
  const x = useSharedValue(0);
  const placed = useSharedValue(false);

  useEffect(() => {
    if (!itemW) return;
    const target = index * itemW;
    // First layout jumps into place; later changes slide.
    x.set(placed.get() ? withTiming(target, { duration: motion.push, easing: motion.ease }) : target);
    placed.set(true);
  }, [index, itemW, x, placed]);

  const indicator = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));

  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={[{ flexDirection: 'row', backgroundColor: color.segTrack, borderRadius: radius.pill, padding: PAD }, style]}
    >
      {itemW ? (
        <Animated.View
          pointerEvents="none"
          style={[
            { position: 'absolute', top: PAD, bottom: PAD, left: PAD, width: itemW, borderRadius: radius.pill, backgroundColor: color.blue, ...shadow.glow },
            indicator,
          ]}
        />
      ) : null}
      {options.map((o) => {
        const on = o.key === value;
        const t = tones[o.tone ?? 'blue'];
        return (
          <Press
            key={o.key}
            onPress={() => onChange(o.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={{ flex: 1, height: control.seg, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: tight ? 4 : 6 }}
          >
            <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: tight ? 13 : 15, fontWeight: on ? '700' : '600', color: on ? color.white : color.ink }}>
              {o.label}
            </Text>
            {o.count !== undefined ? (
              <View style={{ minWidth: tight ? 18 : 20, height: tight ? 18 : 20, paddingHorizontal: tight ? 5 : 6, borderRadius: radius.pill, backgroundColor: on ? color.segBadgeOn : t.tint, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 12, lineHeight: tight ? 18 : 20, fontWeight: '700', color: on ? color.white : t.text, fontVariant: ['tabular-nums'] }}>{o.count}</Text>
              </View>
            ) : null}
          </Press>
        );
      })}
    </View>
  );
}
