import { useEffect } from 'react';
import { Text } from 'react-native';
import Animated, { Easing, FadeIn, useAnimatedProps, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { color, motion } from '../../../../theme/v2';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const CONFETTI = ['#FFFFFF', '#FFD60A', '#2BBF7A', '#FF2D78', '#7E3BFF'];
const BURST = Easing.bezier(0.2, 0.8, 0.3, 1);

/** Blue flood, white disc pops in, the check draws, 18 pieces burst, then the copy rises. */
export function Celebration({ twin }: { twin: boolean }) {
  const pop = useSharedValue(0);
  const draw = useSharedValue(60);
  const t1 = useSharedValue(0);
  const t2 = useSharedValue(0);
  useEffect(() => {
    pop.set(withTiming(1, { duration: 600, easing: motion.spring }));
    draw.set(withDelay(320, withTiming(0, { duration: 420, easing: Easing.out(Easing.ease) })));
    t1.set(withDelay(520, withTiming(1, { duration: 420, easing: Easing.out(Easing.ease) })));
    t2.set(withDelay(680, withTiming(1, { duration: 420, easing: Easing.out(Easing.ease) })));
  }, [pop, draw, t1, t2]);
  const disc = useAnimatedStyle(() => ({ opacity: Math.min(1, pop.get() * 2), transform: [{ scale: 0.3 + 0.7 * pop.get() }] }));
  const check = useAnimatedProps(() => ({ strokeDashoffset: draw.get() }));
  const rise1 = useAnimatedStyle(() => ({ opacity: t1.get(), transform: [{ translateY: 14 * (1 - t1.get()) }] }));
  const rise2 = useAnimatedStyle(() => ({ opacity: t2.get(), transform: [{ translateY: 14 * (1 - t2.get()) }] }));
  return (
    <Animated.View entering={FadeIn.duration(220)} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 50, backgroundColor: color.blue, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      {Array.from({ length: 18 }, (_, i) => (
        <Piece key={i} i={i} />
      ))}
      <Animated.View style={[{ width: 112, height: 112, borderRadius: 999, backgroundColor: color.white, alignItems: 'center', justifyContent: 'center', boxShadow: '0 16px 40px rgba(0,0,0,0.18)' }, disc]}>
        <Svg width={64} height={64} viewBox="0 0 64 64" fill="none">
          <AnimatedPath d="M16 33 L27 44 L48 21" stroke={color.blue} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={60} animatedProps={check} />
        </Svg>
      </Animated.View>
      <Animated.Text style={[{ marginTop: 28, fontSize: 28, lineHeight: 34, fontWeight: '800', letterSpacing: -0.4, textAlign: 'center', color: color.white }, rise1]}>Your post has been created!</Animated.Text>
      <Animated.View style={rise2}>
        <Text style={{ marginTop: 8, fontSize: 15, lineHeight: 20, fontWeight: '500', color: color.white }}>{twin ? 'Saved as Guided and Outline' : 'Saved to Briefs'}</Text>
      </Animated.View>
    </Animated.View>
  );
}

function Piece({ i }: { i: number }) {
  const t = useSharedValue(0);
  const dx = ((i * 53) % 200) - 100;
  const dy = -120 - ((i * 29) % 160);
  const rot = (i * 97) % 720;
  useEffect(() => {
    t.set(withDelay(120 + (i % 6) * 40, withTiming(1, { duration: 1300, easing: BURST })));
  }, [t, i]);
  const a = useAnimatedStyle(() => ({ opacity: 1 - t.get(), transform: [{ translateX: dx * t.get() }, { translateY: dy * t.get() }, { rotate: `${rot * t.get()}deg` }] }));
  const size = i % 3 ? 8 : 12;
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: `${6 + ((i * 37) % 88)}%`, top: '48%', width: size, height: size, borderRadius: i % 2 ? 999 : 2, backgroundColor: CONFETTI[i % 5] }, a]} />;
}

