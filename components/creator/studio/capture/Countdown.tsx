import { useEffect, useRef, useState, type JSX } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { color, type } from '../../../../theme/tokens';
import type { CountdownSeconds } from './constants';

export type CountdownProps = {
  seconds: Exclude<CountdownSeconds, 0>;
  onDone(): void;
  onCancel(): void;
};

export function Countdown({ seconds, onDone, onCancel }: CountdownProps): JSX.Element {
  const [count, setCount] = useState<number>(seconds);
  const pop = useSharedValue(0);
  const doneRef = useRef(onDone);

  useEffect(() => {
    doneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    pop.value = 0;
    pop.value = withSpring(1, { damping: 14, stiffness: 180 });
    const timer = setTimeout(() => {
      if (count > 1) setCount(count - 1);
      else doneRef.current();
    }, 1000);
    return () => clearTimeout(timer);
  }, [count, pop]);

  const numeralStyle = useAnimatedStyle(() => ({
    opacity: pop.value,
    transform: [{ scale: 1.6 - pop.value * 0.6 }],
  }));

  return (
    <Pressable
      style={styles.root}
      onPress={onCancel}
      accessibilityRole="button"
      accessibilityLabel={`Recording in ${count}. Tap to cancel.`}
    >
      <Animated.Text style={[styles.numeral, numeralStyle]}>{count}</Animated.Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.scrim,
  },
  numeral: {
    color: color.white,
    fontSize: 140,
    fontWeight: type.weight.heavy,
    fontVariant: ['tabular-nums'],
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 12,
  },
});
