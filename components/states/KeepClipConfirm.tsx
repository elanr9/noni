import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { color, motion, radius, space, type } from '../../theme/tokens';
import { Icon } from '../ui/Icon';

export interface KeepClipConfirmProps {
  visible: boolean;
  label?: string;
  onDone?: () => void;
}

/**
 * Signature keep-clip confirmation: brief check flash at 240ms ease-out,
 * then fades so recording can continue.
 */
export function KeepClipConfirm({
  visible,
  label = 'Clip kept',
  onDone,
}: KeepClipConfirmProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.97)).current;

  useEffect(() => {
    if (!visible) {
      opacity.setValue(0);
      scale.setValue(motion.pressScale);
      return;
    }
    opacity.setValue(0);
    scale.setValue(motion.pressScale);
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: motion.base,
        easing: motion.easeOut,
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 1,
        duration: motion.base,
        easing: motion.easeOut,
        useNativeDriver: true,
      }),
    ]).start(() => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: motion.fast,
        easing: motion.easeOut,
        useNativeDriver: true,
        delay: motion.slow,
      }).start(({ finished }) => {
        if (finished) onDone?.();
      });
    });
  }, [visible, opacity, scale, onDone]);

  if (!visible) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.wrap, { opacity, transform: [{ scale }] }]}
    >
      <View style={styles.pill}>
        <Icon name="check" size={18} color={color.white} />
        <Text style={styles.label}>{label}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 40,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    backgroundColor: color.green,
    paddingVertical: space[3],
    paddingHorizontal: space[5],
    borderRadius: radius.pill,
  },
  label: {
    fontSize: type.size.action,
    fontWeight: type.weight.bold,
    color: color.white,
  },
});
