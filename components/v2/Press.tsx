import { Pressable, type GestureResponderEvent, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { motion } from '../../theme/v2';
import { tap } from './haptics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface PressProps extends Omit<PressableProps, 'style'> {
  style?: StyleProp<ViewStyle>;
  /** Pressed scale; 0.97 everywhere except the Create button. */
  scaleTo?: number;
  haptic?: boolean;
}

/** Every v2 pressable: scale 0.97 over 90ms on the ease curve, light haptic on press. */
export function Press({ style, scaleTo = motion.pressScale, haptic = true, onPressIn, onPressOut, onPress, disabled, ...rest }: PressProps) {
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  const to = (v: number) => {
    scale.set(withTiming(v, { duration: motion.press, easing: motion.ease }));
  };
  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      style={[style, animated]}
      onPressIn={(e: GestureResponderEvent) => {
        to(scaleTo);
        onPressIn?.(e);
      }}
      onPressOut={(e: GestureResponderEvent) => {
        to(1);
        onPressOut?.(e);
      }}
      onPress={(e: GestureResponderEvent) => {
        if (haptic) tap();
        onPress?.(e);
      }}
    />
  );
}
