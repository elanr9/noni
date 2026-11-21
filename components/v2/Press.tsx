import { Pressable, type GestureResponderEvent, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { motion } from '../../theme/v2';
import { tap } from './haptics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface PressProps extends Omit<PressableProps, 'style'> {
  style?: StyleProp<ViewStyle>;
  /** Pressed scale; 0.97 everywhere except the Create button. */
  scaleTo?: number;
  haptic?: boolean;
}

/**
 * Every v2 pressable: light haptic on press and a scale to 0.97.
 * The way down eases in, so a touch that turns into a scroll or a swipe lets go before the
 * control has visibly moved. The way back is a spring with no bounce, so release never snaps.
 */
export function Press({ style, scaleTo = motion.pressScale, haptic = true, onPressIn, onPressOut, onPress, disabled, ...rest }: PressProps) {
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  const down = () => scale.set(withTiming(scaleTo, { duration: motion.pressIn, easing: motion.pressEase }));
  const up = () => scale.set(withSpring(1, motion.pressOut));
  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      style={[style, animated]}
      onPressIn={(e: GestureResponderEvent) => {
        down();
        onPressIn?.(e);
      }}
      onPressOut={(e: GestureResponderEvent) => {
        up();
        onPressOut?.(e);
      }}
      onPress={(e: GestureResponderEvent) => {
        if (haptic) tap();
        onPress?.(e);
      }}
    />
  );
}
