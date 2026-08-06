import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { color, motion, type as typeToken } from '../../../theme/tokens';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export interface ScoreDialProps {
  /** 0–100. Ring colour: green >= 80, amber >= 65, else danger. */
  score: number;
  /** 700 9px uppercase line beneath the value. */
  label?: string;
  size?: number;
}

function ringColor(score: number): string {
  if (score >= 80) return color.green;
  if (score >= 65) return color.amber;
  return color.danger;
}

/** Admin handoff §8 step 7 — AI score dial, 76px, 7px stroke, 420ms draw. */
export function ScoreDial({ score, label, size = 76 }: ScoreDialProps) {
  const strokeWidth = 7;
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
          stroke={ringColor(score)}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={dashOffset}
          fill="none"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={styles.center}>
        <Text style={styles.score}>{score}</Text>
        {label !== undefined && <Text style={styles.label}>{label.toUpperCase()}</Text>}
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
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: typeToken.tracking.title,
    color: color.ink,
  },
  label: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: typeToken.tracking.label,
    color: color.slate400,
  },
});
