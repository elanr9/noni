import { useRef } from 'react';
import {
  Animated,
  Pressable,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { motion } from '../../theme/tokens';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface PressableScaleProps extends Omit<PressableProps, 'style'> {
  style?: StyleProp<ViewStyle>;
}

/** Pressable with the standard press feedback: scale(0.97) over 90ms ease-out. */
export function PressableScale({
  style,
  onPressIn,
  onPressOut,
  ...rest
}: PressableScaleProps) {
  const scale = useRef(new Animated.Value(1)).current;

  return (
    <AnimatedPressable
      {...rest}
      style={[style, { transform: [{ scale }] }]}
      onPressIn={(e) => {
        Animated.timing(scale, {
          toValue: motion.pressScale,
          duration: motion.instant,
          easing: motion.easeOut,
          useNativeDriver: true,
        }).start();
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        Animated.timing(scale, {
          toValue: 1,
          duration: motion.instant,
          easing: motion.easeOut,
          useNativeDriver: true,
        }).start();
        onPressOut?.(e);
      }}
    />
  );
}
