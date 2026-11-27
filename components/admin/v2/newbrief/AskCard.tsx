// The few questions the writer asks before it writes, one at a time. Each is
// answered with a tap (or a typed line), so the post is built on what the
// manager knows instead of what a model guesses. One answer moves straight to
// the next question; a pick-several question has a Next button.
import { useEffect, useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import Animated, { FadeInRight, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';

import type { AskAnswer, AskQuestion } from '../../../../lib/brief-ai';
import { color, motion, radius, shadow } from '../../../../theme/v2';
import { Icon, Press, tap } from '../../../v2';

export interface AskCardProps {
  questions: AskQuestion[];
  /** Every question has been answered or passed. */
  onDone: (answers: AskAnswer[]) => void;
}

/** How long a tapped answer stays lit before the next question slides in. */
const ADVANCE_MS = 260;

function Choice({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const pop = useSharedValue(1);
  useEffect(() => {
    if (on) pop.set(withSequence(withTiming(0.97, { duration: 0 }), withTiming(1.02, { duration: 220, easing: motion.spring }), withTiming(1, { duration: 140, easing: motion.tabEase })));
  }, [on, pop]);
  const s = useAnimatedStyle(() => ({ transform: [{ scale: pop.get() }] }));
  return (
    <Animated.View style={s}>
      <Press
        onPress={onPress}
        accessibilityRole="button"
        accessibilityState={{ selected: on }}
        style={{ minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingLeft: 16, paddingRight: 12, borderRadius: 16, backgroundColor: on ? color.blueTint : color.grey1 }}
      >
        <Text style={{ flex: 1, fontSize: 15, lineHeight: 20, fontWeight: '600', color: on ? color.blueDeep : color.ink }}>{label}</Text>
        <View style={{ width: 24, height: 24, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? color.blue : color.card }}>{on ? <Icon name="check" size={16} color={color.white} /> : null}</View>
      </Press>
    </Animated.View>
  );
}

export function AskCard({ questions, onDone }: AskCardProps) {
  const [at, setAt] = useState(0);
  const [picked, setPicked] = useState<string[]>([]);
  const [typed, setTyped] = useState('');
  const answers = useRef<AskAnswer[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const q = questions[Math.min(at, questions.length - 1)];
  const own = typed.trim();
  const ready = picked.length > 0 || !!own;

  const next = (chosen: string[]) => {
    const all = own ? chosen.concat([own]) : chosen;
    if (all.length) answers.current = answers.current.concat([{ question: q.question, answers: all }]);
    if (at >= questions.length - 1) {
      onDone(answers.current);
      return;
    }
    setAt(at + 1);
    setPicked([]);
    setTyped('');
  };

  const choose = (option: string) => {
    tap();
    if (q.many) {
      setPicked((cur) => (cur.includes(option) ? cur.filter((o) => o !== option) : cur.concat([option])));
      return;
    }
    setPicked([option]);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => next([option]), ADVANCE_MS);
  };

  return (
    <View style={{ backgroundColor: color.card, borderRadius: radius.card, padding: 16, gap: 14, ...shadow.card }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {questions.map((x, i) => (
          <View key={x.id} style={{ height: 6, width: i === at ? 20 : 6, borderRadius: radius.pill, backgroundColor: i <= at ? color.blue : color.grey2 }} />
        ))}
        <View style={{ flex: 1 }} />
        <Press accessibilityRole="button" onPress={() => next([])} hitSlop={10}>
          <Text style={{ fontSize: 14, lineHeight: 20, fontWeight: '600', color: color.grey4 }}>Skip</Text>
        </Press>
      </View>
      <Animated.View key={q.id} entering={FadeInRight.duration(240)} style={{ gap: 10 }}>
        <Text style={{ fontSize: 19, lineHeight: 25, fontWeight: '700', letterSpacing: -0.3, color: color.ink }}>{q.question}</Text>
        {q.options.map((o) => (
          <Choice key={o} label={o} on={picked.includes(o)} onPress={() => choose(o)} />
        ))}
        <TextInput
          value={typed}
          onChangeText={setTyped}
          placeholder="Something else"
          placeholderTextColor={color.grey3}
          returnKeyType="done"
          onSubmitEditing={() => (ready ? next(picked) : undefined)}
          style={{ minHeight: 50, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 16, backgroundColor: color.grey1, fontSize: 15, lineHeight: 20, fontWeight: '600', color: color.ink }}
        />
        {q.many || own ? (
          <Press
            disabled={!ready}
            onPress={() => next(picked)}
            accessibilityRole="button"
            style={{ height: 50, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: ready ? color.blue : color.grey1 }}
          >
            <Text style={{ fontSize: 15, fontWeight: '700', color: ready ? color.white : color.grey3 }}>{at >= questions.length - 1 ? 'Write it' : 'Next'}</Text>
          </Press>
        ) : null}
      </Animated.View>
    </View>
  );
}
