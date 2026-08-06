import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { color, motion, type } from '../../../theme/tokens';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export interface ScoreDialProps {
  /** 0–100. */
  score: number;
  size?: number;
  /** Green for passing, amber for failed checks. */
  tone?: 'green' | 'amber';
}

/** Admin handoff §8 step 7 — AI score dial, 420ms draw. */
export function ScoreDial({ score, size = 116, tone = 'green' }: ScoreDialProps) {
  const strokeWidth = 10;
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
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

  const dashOffset = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [circumference, circumference * (1 - Math.min(score, 100) / 100)],
  });

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color.line}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={tone === 'green' ? color.green : color.amber}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={dashOffset}
          fill="none"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={styles.center}>
        <Text style={[styles.score, { fontSize: Math.round(size * 0.29) }]}>{score}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  score: {
    fontWeight: '700',
    letterSpacing: type.tracking.title,
    color: color.ink,
  },
});
