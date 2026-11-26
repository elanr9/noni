// The Fill in with AI pill, and everything it shows while the AI works: the
// sparkle turns, the line under it says what the writer is doing right now
// (the steps the brief engine really runs, in order), and a soft bar fills
// the pill from the left so a minute of writing never looks stuck. When the
// fields have landed the pill turns green with a check for a beat.
import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import Animated, { Easing, FadeInDown, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

import { briefs, color, motion, radius } from '../../../../theme/v2';
import { Icon, Press } from '../../../v2';

export type AiPhase = 'idle' | 'reference' | 'writing' | 'filling';

/** What the writer is doing, by seconds into the run. The last line holds. */
export type AiSteps = readonly (readonly [number, string])[];

export const GUIDED_STEPS: AiSteps = [
  [0, 'Reading your brand'],
  [5, 'Finding the angle'],
  [20, 'Writing the hook'],
  [32, 'Writing the clips'],
  [50, 'Checking every line'],
  [72, 'Polishing'],
];
export const SLIDES_STEPS: AiSteps = [
  [0, 'Reading your brand'],
  [5, 'Finding the angle'],
  [20, 'Writing slide one'],
  [32, 'Writing the slides'],
  [50, 'Checking every line'],
  [72, 'Polishing'],
];
export const OUTLINE_STEPS: AiSteps = [
  [0, 'Reading your brand'],
  [4, 'Finding the angle'],
  [10, 'Writing the outline'],
  [30, 'Polishing'],
];
export const LONG_TEXT_STEPS: AiSteps = [
  [0, 'Reading your brand'],
  [4, 'Finding the angle'],
  [10, 'Writing the text'],
  [30, 'Polishing'],
];

/** How far the bar has crept by the time a typical run of these steps ends. */
const WRITING_TO = 0.88;
/** How long the pill says Done. */
export const DONE_MS = 1100;

export interface AiFillButtonProps {
  /** Idle label: "Fill in with AI". */
  label: string;
  enabled: boolean;
  phase: AiPhase;
  /** Filling: how many of the fields have landed, 0 to 1. */
  filled?: number;
  steps: AiSteps;
  /** Bump when a fill has finished well: the pill shows Done for a beat. */
  doneKey?: number;
  onPress: () => void;
  height?: number;
  fontSize?: number;
}

export function AiFillButton({ label, enabled, phase, filled = 0, steps, doneKey = 0, onPress, height = 56, fontSize = 15 }: AiFillButtonProps) {
  const busy = phase !== 'idle';
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const [width, setWidth] = useState(0);
  const seenDone = useRef(doneKey);
  const p = useSharedValue(0);
  const spin = useSharedValue(0);
  const pulse = useSharedValue(1);
  const pop = useSharedValue(1);

  // The writer's steps tick by the clock; a new run starts from the first.
  useEffect(() => {
    if (phase !== 'writing') return;
    const timers = steps.map(([at], i) => setTimeout(() => setStep(i), at * 1000));
    return () => {
      timers.forEach(clearTimeout);
      setStep(0);
    };
  }, [phase, steps]);

  useEffect(() => {
    if (phase === 'reference') p.set(withTiming(0.12, { duration: 40_000, easing: Easing.out(Easing.cubic) }));
    else if (phase === 'writing') p.set(withTiming(WRITING_TO, { duration: (steps[steps.length - 1][0] + 18) * 1000, easing: Easing.out(Easing.quad) }));
    else if (phase === 'filling') p.set(withTiming(WRITING_TO + (1 - WRITING_TO) * Math.min(1, filled), { duration: 320, easing: motion.tabEase }));
    else p.set(withTiming(0, { duration: 0 }));
  }, [phase, filled, steps, p]);

  useEffect(() => {
    if (busy) {
      spin.set(withRepeat(withTiming(360, { duration: 1600, easing: Easing.linear }), -1, false));
      pulse.set(withRepeat(withSequence(withTiming(1.18, { duration: 700, easing: Easing.inOut(Easing.ease) }), withTiming(1, { duration: 700, easing: Easing.inOut(Easing.ease) })), -1, false));
    } else {
      spin.set(withTiming(0, { duration: 0 }));
      pulse.set(withTiming(1, { duration: 160 }));
    }
  }, [busy, spin, pulse]);

  useEffect(() => {
    if (doneKey === seenDone.current) return;
    seenDone.current = doneKey;
    setDone(true);
    pop.set(withSequence(withTiming(0.96, { duration: 0 }), withTiming(1.04, { duration: 300, easing: motion.spring }), withTiming(1, { duration: 200, easing: motion.tabEase })));
    const t = setTimeout(() => setDone(false), DONE_MS);
    return () => clearTimeout(t);
  }, [doneKey, pop]);

  const bar = useAnimatedStyle(() => ({ width: p.get() * width }));
  const icon = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.get()}deg` }, { scale: pulse.get() }] }));
  const pill = useAnimatedStyle(() => ({ transform: [{ scale: pop.get() }] }));

  const on = enabled || busy || done;
  const fg = on ? color.white : color.grey3;
  const text = done ? 'Done' : phase === 'reference' ? 'Reading the link' : phase === 'filling' ? 'Filling in' : phase === 'writing' ? steps[Math.min(step, steps.length - 1)][1] : label;

  return (
    <Animated.View style={[{ flex: 1, minWidth: 0 }, pill]}>
      <Press
        disabled={!enabled || busy || done}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={text}
        accessibilityState={{ busy }}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        style={{ height, borderRadius: radius.pill, overflow: 'hidden', backgroundColor: done ? color.green : on ? color.blue : color.grey1, boxShadow: on && !busy ? briefs.aiGlow : undefined }}
      >
        {busy ? <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: color.blueDeep, opacity: 0.55 }, bar]} /> : null}
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 14 }}>
          <Animated.View style={icon}>
            <Icon name={done ? 'check' : 'auto_awesome'} size={20} color={fg} />
          </Animated.View>
          <Animated.View key={text} entering={FadeInDown.duration(240)} style={{ flexShrink: 1 }}>
            <Text numberOfLines={1} style={{ fontSize, fontWeight: '700', color: fg }}>
              {text}
            </Text>
          </Animated.View>
        </View>
      </Press>
    </Animated.View>
  );
}
