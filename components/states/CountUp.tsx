import { useEffect, useRef, useState } from 'react';
import { Animated, Text, type StyleProp, type TextStyle } from 'react-native';

import { motion } from '../../theme/tokens';

export interface CountUpProps {
  value: number;
  /** Prefix shown before the number, e.g. "$". */
  prefix?: string;
  durationMs?: number;
  style?: StyleProp<TextStyle>;
}

/** Signature earnings estimate count-up (240ms ease-out by default). */
export function CountUp({
  value,
  prefix = '',
  durationMs = motion.base,
  style,
}: CountUpProps) {
  const anim = useRef(new Animated.Value(0)).current;
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const sub = anim.addListener(({ value: v }) => setDisplay(Math.round(v)));
    anim.setValue(0);
    Animated.timing(anim, {
      toValue: value,
      duration: durationMs,
      easing: motion.easeOut,
      useNativeDriver: false,
    }).start();
    return () => anim.removeListener(sub);
  }, [anim, value, durationMs]);

  return (
    <Text style={style}>
      {prefix}
      {display.toLocaleString('en-US')}
    </Text>
  );
}
