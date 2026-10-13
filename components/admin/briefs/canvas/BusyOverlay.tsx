// AI working overlay on the canvas (SSCanvas.jsx busy): a pulsing blue disc
// inside an expanding ring (ss-ring 1.4s, ss-pulse 1.4s) and a status line.

import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, FadeIn, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

import { color, type as typeToken } from '../../../../theme/tokens';
import { Icon } from '../../../ui/Icon';

export function BusyOverlay({ label }: { label: string }) {
  const ring = useSharedValue(0);
  const pulse = useSharedValue(1);
  useEffect(() => {
    ring.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.out(Easing.cubic) }), -1, false);
    pulse.value = withRepeat(withSequence(withTiming(1.14, { duration: 700, easing: Easing.inOut(Easing.ease) }), withTiming(1, { duration: 700, easing: Easing.inOut(Easing.ease) })), -1, false);
  }, [ring, pulse]);
  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 0.8 + ring.value * 0.7 }],
    opacity: 0.45 * (1 - ring.value),
  }));
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
  return (
    <Animated.View entering={FadeIn.duration(200)} style={styles.scrim}>
      <View style={styles.badge}>
        <Animated.View style={[styles.ring, ringStyle]} />
        <Animated.View style={[styles.disc, pulseStyle]} />
        <Icon name="sparkles" size={26} color={color.white} />
      </View>
      <Text style={styles.label}>{label}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: color.scrimStrong, alignItems: 'center', justifyContent: 'center', gap: 16 },
  badge: { width: 72, height: 72, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: 72, height: 72, borderRadius: 999, backgroundColor: color.blue500 },
  disc: { position: 'absolute', width: 52, height: 52, borderRadius: 999, backgroundColor: color.blue500 },
  label: { fontFamily: typeToken.font.ui, fontWeight: '700', fontSize: 16, letterSpacing: -0.2, color: color.white },
});
