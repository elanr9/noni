import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedProps, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import * as Haptics from 'expo-haptics';

import { color, radius } from '../../../../../theme/v2';
import { Icon, Press } from '../../../../v2';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const FLOOD = 1800;
const ORIGIN = { x: -190, y: 320 };
const END = { x: 170, y: -330 };
const POP = Easing.bezier(0.2, 0.8, 0.2, 1);
const FLY = Easing.bezier(0.4, 0, 0.2, 1);
const FLOOD_EASE = Easing.bezier(0.3, 0.7, 0.2, 1);

export interface CelebrationProps {
  kind: 'approved' | 'sent';
  creatorName: string;
  /** Posts this creator still has waiting after this one. */
  left: number;
  onReturn: () => void;
}

/**
 * Approve or send back takeover: the blue disc pops and draws its check, swaps
 * out for a rocket flying corner to corner while a blue flood fills the
 * screen, then the headline, body and the return pill rise in.
 */
export function Celebration({ kind, creatorName, left, onReturn }: CelebrationProps) {
  const disc = useSharedValue(0);
  const discOut = useSharedValue(0);
  const dash = useSharedValue(24);
  const fly = useSharedValue(0);
  const flood = useSharedValue(0);
  const rise = useSharedValue(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    disc.set(withSequence(withTiming(0.6, { duration: 300, easing: POP }), withTiming(1, { duration: 200, easing: POP })));
    dash.set(withDelay(300, withTiming(0, { duration: 350, easing: Easing.out(Easing.quad) })));
    discOut.set(withDelay(950, withTiming(1, { duration: 300, easing: Easing.ease })));
    fly.set(withDelay(1100, withTiming(1, { duration: 1100, easing: FLY })));
    flood.set(withDelay(1150, withTiming(1, { duration: 900, easing: FLOOD_EASE })));
    rise.set(withDelay(2000, withTiming(1, { duration: 450, easing: Easing.out(Easing.quad) })));
    const t = setTimeout(() => setReady(true), 2000);
    return () => clearTimeout(t);
  }, [disc, dash, discOut, fly, flood, rise]);

  const discStyle = useAnimatedStyle(() => {
    const d = disc.get();
    // 0.2 -> 1.12 over the first 60%, settle to 1.
    const scale = d <= 0.6 ? 0.2 + (d / 0.6) * 0.92 : 1.12 - ((d - 0.6) / 0.4) * 0.12;
    const out = discOut.get();
    return { opacity: Math.min(1, d / 0.6) * (1 - out), transform: [{ scale: scale * (1 - 0.4 * out) }] };
  });
  const checkProps = useAnimatedProps(() => ({ strokeDashoffset: dash.get() }));
  const floodStyle = useAnimatedStyle(() => {
    const f = flood.get();
    return { transform: [{ translateX: ORIGIN.x * (1 - f) }, { translateY: ORIGIN.y * (1 - f) }, { scale: f }] };
  });
  const rocketStyle = useAnimatedStyle(() => {
    const f = fly.get();
    return {
      opacity: f === 0 ? 0 : Math.min(1, f / 0.12),
      transform: [
        { translateX: ORIGIN.x + (END.x - ORIGIN.x) * f },
        { translateY: ORIGIN.y + (END.y - ORIGIN.y) * f },
        { scale: 0.7 + 0.4 * f },
      ],
    };
  });
  const riseStyle = useAnimatedStyle(() => ({ opacity: rise.get(), transform: [{ translateY: 14 * (1 - rise.get()) }] }));

  const sent = kind === 'sent';
  return (
    <View style={styles.root} accessibilityViewIsModal>
      <Animated.View pointerEvents="none" style={[styles.flood, floodStyle]} />
      <Animated.View pointerEvents="none" style={[styles.disc, discStyle]}>
        <Svg width={64} height={64} viewBox="0 0 24 24" fill="none">
          <AnimatedPath d="M5 12.5l4.5 4.5L19 7.5" stroke={color.white} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={24} animatedProps={checkProps} />
        </Svg>
      </Animated.View>
      <Animated.View pointerEvents="none" style={[styles.rocket, rocketStyle]}>
        <Icon name="rocket_launch" size={88} color={color.white} />
      </Animated.View>
      <Animated.View pointerEvents={ready ? 'auto' : 'none'} style={[styles.copy, riseStyle]}>
        <Text style={styles.title} accessibilityRole="header">
          {sent ? 'Changes sent!' : 'Post approved!'}
        </Text>
        <Text style={styles.body}>
          {sent ? `${creatorName} will get your notes and send a new take.` : `We'll let ${creatorName} know and ping you both when it's up.`}
        </Text>
        <View style={{ alignItems: 'center', marginTop: 28 }}>
          <Press accessibilityRole="button" onPress={onReturn} style={styles.cta}>
            <Text style={styles.ctaText}>{left > 0 ? `Return to ${creatorName}'s posts` : 'Return to review'}</Text>
          </Press>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill, zIndex: 20, backgroundColor: color.card, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  flood: { position: 'absolute', width: FLOOD, height: FLOOD, borderRadius: radius.pill, backgroundColor: color.blue },
  disc: { position: 'absolute', width: 120, height: 120, borderRadius: radius.pill, backgroundColor: color.blue, alignItems: 'center', justifyContent: 'center' },
  rocket: { position: 'absolute', width: 96, height: 96, alignItems: 'center', justifyContent: 'center' },
  copy: { position: 'absolute', left: 32, right: 32, top: '50%', marginTop: -60 },
  title: { fontSize: 30, lineHeight: 36, fontWeight: '800', letterSpacing: -0.5, color: color.white, textAlign: 'center' },
  body: { fontSize: 16, lineHeight: 22, color: color.white, opacity: 0.92, textAlign: 'center', marginTop: 10 },
  cta: { height: 52, paddingHorizontal: 28, borderRadius: radius.pill, backgroundColor: color.card, alignItems: 'center', justifyContent: 'center' },
  ctaText: { fontSize: 17, fontWeight: '700', color: color.blueDeep },
});
