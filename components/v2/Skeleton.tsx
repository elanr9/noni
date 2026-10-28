import { useEffect } from 'react';
import type { DimensionValue, StyleProp, ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { color, motion, radius, shadow, space } from '../../theme/v2';

export interface SkeletonProps {
  h?: number;
  w?: DimensionValue;
  r?: number;
  style?: StyleProp<ViewStyle>;
}

/** Card-shaped block shimmering opacity 1 to 0.45 and back over 1.2s. */
export function Skeleton({ h = 56, w = '100%', r = radius.card, style }: SkeletonProps) {
  const opacity = useSharedValue(1);
  useEffect(() => {
    opacity.set(withRepeat(withTiming(0.45, { duration: motion.shimmer / 2, easing: Easing.inOut(Easing.ease) }), -1, true));
  }, [opacity]);
  const animated = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  return (
    <Animated.View
      style={[{ height: h, width: w, borderRadius: r, backgroundColor: color.card, marginBottom: space.cardGap, ...shadow.card }, animated, style]}
    />
  );
}
