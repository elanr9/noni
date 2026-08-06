import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { color, motion, radiusAdmin } from '../../../theme/tokens';

export interface ScoreBarProps {
  /** 0–100. */
  score: number;
  /** Green for passing, amber for failed checks. */
  tone?: 'green' | 'amber';
  height?: number;
}

/** Admin handoff §8 step 7 — per-section score bar, 420ms draw. */
export function ScoreBar({ score, tone = 'green', height = 6 }: ScoreBarProps) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: motion.slow,
      easing: motion.easeOut,
      useNativeDriver: false,
    }).start();
  }, [score, progress]);

  const width = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', `${Math.min(score, 100)}%`],
  });

  return (
    <View style={[styles.track, { height, borderRadius: height / 2 }]}>
      <Animated.View
        style={{
          width,
          height,
          borderRadius: height / 2,
          backgroundColor: tone === 'green' ? color.green : color.amber,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    backgroundColor: color.fillQuiet,
    overflow: 'hidden',
    borderRadius: radiusAdmin.pill,
  },
});
