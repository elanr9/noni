import { useEffect, type JSX } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  interpolateColor,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { color, motion, space } from '../../../../theme/tokens';
import { HOLD_ARM_MS, WHITE } from './constants';

const OUTER = space.shutter;
const RING = 5;
const INNER = OUTER - RING * 2 - 8;

export type RecordButtonProps = {
  recording: boolean;
  disabled: boolean;
  onTap(): void;
  onHoldStart(): void;
  onHoldEnd(): void;
};

export function RecordButton({ recording, disabled, onTap, onHoldStart, onHoldEnd }: RecordButtonProps): JSX.Element {
  const rec = useSharedValue(recording ? 1 : 0);
  const held = useSharedValue(0);
  const holding = useSharedValue(false);

  useEffect(() => {
    rec.value = withTiming(recording ? 1 : 0, { duration: motion.fast });
  }, [recording, rec]);

  const longPress = Gesture.LongPress()
    .enabled(!disabled)
    .minDuration(HOLD_ARM_MS)
    .maxDistance(80)
    .onStart(() => {
      holding.value = true;
      held.value = withTiming(1, { duration: motion.fast });
      runOnJS(onHoldStart)();
    })
    .onFinalize(() => {
      if (!holding.value) return;
      holding.value = false;
      held.value = withTiming(0, { duration: motion.fast });
      runOnJS(onHoldEnd)();
    });

  const tap = Gesture.Tap()
    .enabled(!disabled)
    .maxDuration(HOLD_ARM_MS)
    .onEnd((_e, success) => {
      if (success) runOnJS(onTap)();
    });

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + rec.value * 0.12 + held.value * 0.08 }],
    borderColor: interpolateColor(rec.value, [0, 1], [WHITE, color.danger]),
  }));

  const innerStyle = useAnimatedStyle(() => ({
    borderRadius: interpolate(rec.value, [0, 1], [INNER / 2, 10]),
    transform: [{ scale: interpolate(rec.value, [0, 1], [1, 0.5]) }],
  }));

  return (
    <GestureDetector gesture={Gesture.Exclusive(longPress, tap)}>
      <View
        style={[styles.hit, disabled && styles.disabled]}
        accessibilityRole="button"
        accessibilityLabel={recording ? 'Stop recording' : 'Record. Tap to start, hold to record while held.'}
      >
        <Animated.View style={[styles.ring, ringStyle]} />
        <Animated.View style={[styles.inner, innerStyle]} />
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  hit: {
    width: OUTER + 16,
    height: OUTER + 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.5,
  },
  ring: {
    position: 'absolute',
    width: OUTER,
    height: OUTER,
    borderRadius: OUTER / 2,
    borderWidth: RING,
    borderColor: WHITE,
  },
  inner: {
    width: INNER,
    height: INNER,
    backgroundColor: color.danger,
  },
});
