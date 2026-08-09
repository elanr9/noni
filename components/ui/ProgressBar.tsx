import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { color, motion, radius, space } from '../../theme/tokens';

export interface ProgressBarProps {
  /** 0..1 fill for the continuous bar. */
  progress?: number;
  /** Discrete step mode: current 1-based step. */
  step?: number;
  /** Discrete step mode: total steps. */
  total?: number;
  variant?: 'bar' | 'dots';
  style?: StyleProp<ViewStyle>;
}

export function ProgressBar({
  progress,
  step,
  total,
  variant = 'bar',
  style,
}: ProgressBarProps) {
  if (variant === 'dots' && total !== undefined && total > 0) {
    const current = step ?? 0;
    return (
      <View style={[styles.dotsRow, style]}>
        {Array.from({ length: total }, (_, i) => (
          <View
            key={i}
            style={[styles.dot, i < current ? styles.dotOn : styles.dotOff]}
          />
        ))}
      </View>
    );
  }

  const fraction =
    progress !== undefined
      ? Math.min(1, Math.max(0, progress))
      : total !== undefined && total > 1 && step !== undefined
        ? Math.min(1, Math.max(0, step / (total - 1)))
        : total !== undefined && total > 0 && step !== undefined
          ? Math.min(1, Math.max(0, step / total))
          : 0;

  return <AnimatedBar fraction={fraction} style={style} />;
}

function AnimatedBar({
  fraction,
  style,
}: {
  fraction: number;
  style?: StyleProp<ViewStyle>;
}) {
  const fill = useRef(new Animated.Value(fraction)).current;

  useEffect(() => {
    Animated.timing(fill, {
      toValue: fraction,
      duration: motion.base,
      easing: motion.easeOut,
      useNativeDriver: false,
    }).start();
  }, [fraction, fill]);

  const width = fill.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={[styles.track, style]}>
      <Animated.View style={[styles.fill, { width }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: color.fillQuiet,
    overflow: 'hidden',
    width: '100%',
  },
  fill: {
    height: '100%',
    backgroundColor: color.blue300,
    borderRadius: radius.pill,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
  },
  dot: {
    height: 6,
    borderRadius: radius.pill,
    flex: 1,
  },
  dotOn: {
    backgroundColor: color.blue300,
  },
  dotOff: {
    backgroundColor: color.fillQuiet,
  },
});

/** Duration token for progress fill animations. */
export const PROGRESS_FILL_MS = motion.base;
