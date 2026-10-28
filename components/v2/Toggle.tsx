import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { color, motion, radius } from '../../theme/v2';
import { Press } from './Press';

export interface ToggleProps {
  on: boolean;
  onChange: (on: boolean) => void;
  /** 40x24 with a 20 knob; 48x28 with a 24 knob by default. */
  small?: boolean;
  accessibilityLabel?: string;
}

/** Switch: blue track when on, grey-2 off; the white knob slides 180ms. */
export function Toggle({ on, onChange, small, accessibilityLabel }: ToggleProps) {
  const w = small ? 40 : 48;
  const h = small ? 24 : 28;
  const knob = small ? 20 : 24;
  const x = useSharedValue(on ? w - knob - 4 : 0);
  useEffect(() => {
    x.set(withTiming(on ? w - knob - 4 : 0, { duration: 180, easing: motion.ease }));
  }, [on, w, knob, x]);
  const slide = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));
  return (
    <Press
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: on }}
      onPress={() => onChange(!on)}
      scaleTo={1}
      style={{ width: w, height: h, borderRadius: radius.pill, backgroundColor: on ? color.blue : color.grey2, padding: 2, justifyContent: 'center' }}
    >
      <Animated.View style={[{ width: knob, height: knob, borderRadius: radius.pill, backgroundColor: color.white, boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }, slide]}>
        <View />
      </Animated.View>
    </Press>
  );
}
