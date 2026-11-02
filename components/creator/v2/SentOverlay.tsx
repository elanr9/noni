import { useEffect } from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated, { Easing, FadeIn, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';

import { color } from '../../../theme/v2';
import { Icon } from '../../v2';

/** Blue flood with the white disc popping in: the shared "Sent for review" moment. */
export function SentOverlay({ label = 'Sent for review' }: { label?: string }) {
  const s = useSharedValue(0.2);
  const o = useSharedValue(0);
  useEffect(() => {
    const ease = Easing.bezier(0.2, 0.8, 0.2, 1);
    o.set(withTiming(1, { duration: 300, easing: ease }));
    s.set(withSequence(withTiming(1.12, { duration: 300, easing: ease }), withTiming(1, { duration: 200, easing: ease })));
  }, [s, o]);
  const disc = useAnimatedStyle(() => ({ opacity: o.get(), transform: [{ scale: s.get() }] }));
  return (
    <Animated.View entering={FadeIn.duration(220)} style={[StyleSheet.absoluteFill, { zIndex: 50, backgroundColor: color.blue, alignItems: 'center', justifyContent: 'center', gap: 14 }]}>
      <Animated.View style={[{ width: 96, height: 96, borderRadius: 999, backgroundColor: color.white, alignItems: 'center', justifyContent: 'center' }, disc]}>
        <Icon name="check" size={56} weight={700} color={color.blue} />
      </Animated.View>
      <Text style={{ fontSize: 28, lineHeight: 34, fontWeight: '800', color: color.white }}>{label}</Text>
    </Animated.View>
  );
}
