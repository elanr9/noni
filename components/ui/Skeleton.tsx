import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  View,
  type DimensionValue,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { color, motion } from '../../theme/tokens';

/** Angled highlight band sweeping across the base fill, 1400ms linear infinite. */
function Shimmer() {
  const [width, setWidth] = useState(0);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (width === 0) return;
    progress.setValue(0);
    const loop = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: motion.shimmer,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [width, progress]);

  const bandWidth = Math.max(1, width * 0.6);
  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-bandWidth, width],
  });

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      {width > 0 && (
        <Animated.View
          style={{
            width: bandWidth,
            height: '100%',
            transform: [{ translateX }, { skewX: '-10deg' }],
          }}
        >
          <Svg width="100%" height="100%">
            <Defs>
              <LinearGradient id="noniShimmer" x1="0%" y1="0%" x2="100%" y2="0%">
                <Stop offset="0" stopColor="#FAFCFE" stopOpacity="0" />
                <Stop offset="0.5" stopColor="#FAFCFE" stopOpacity="1" />
                <Stop offset="1" stopColor="#FAFCFE" stopOpacity="0" />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#noniShimmer)" />
          </Svg>
        </Animated.View>
      )}
    </View>
  );
}

export interface SkeletonLineProps {
  height?: number;
  width?: DimensionValue;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

export function SkeletonLine({
  height = 12,
  width = '100%',
  radius = 8,
  style,
}: SkeletonLineProps) {
  return (
    <View style={[styles.base, { height, width, borderRadius: radius }, style]}>
      <Shimmer />
    </View>
  );
}

export interface SkeletonCardProps {
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

export function SkeletonCard({ height, radius = 18, style }: SkeletonCardProps) {
  return (
    <View
      style={[
        styles.base,
        { borderRadius: radius },
        height !== undefined && { height },
        style,
      ]}
    >
      <Shimmer />
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: color.fillQuiet,
    overflow: 'hidden',
  },
});
