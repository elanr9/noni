import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { color, motion } from '../../../../theme/v2';

/** 8px dots, the current one 24 wide (200ms), blue up to the current step and grey-2 after. */
export function StepDots({ steps, step }: { steps: readonly number[]; step: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
      {steps.map((i) => (
        <Dot key={i} current={i === step} done={i <= step} />
      ))}
    </View>
  );
}

function Dot({ current, done }: { current: boolean; done: boolean }) {
  const w = useSharedValue(current ? 24 : 8);
  useEffect(() => {
    w.set(withTiming(current ? 24 : 8, { duration: 200, easing: motion.ease }));
  }, [current, w]);
  const a = useAnimatedStyle(() => ({ width: w.get() }));
  return <Animated.View style={[{ height: 8, borderRadius: 999, backgroundColor: done ? color.blue : color.grey2 }, a]} />;
}
