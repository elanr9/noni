import { useEffect } from 'react';
import { Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { color, motion } from '../../../../theme/v2';
import { Icon, Press, type IconName } from '../../../v2';

export type OptionDef = { label: string; icon: IconName; sub: string };

export interface OptionCardsProps {
  options: readonly OptionDef[];
  value?: string;
  onPick: (label: string) => void;
  /** 2x2 column cards; off for full-width row cards. */
  grid: boolean;
}

const RISE = Easing.bezier(0.2, 0.8, 0.2, 1);

/** Step 1 and 2 option cards: rise in with a 50ms stagger; the pick glows and springs, the rest dim. */
export function OptionCards({ options, value, onPick, grid }: OptionCardsProps) {
  return (
    <View style={grid ? { flexDirection: 'row', flexWrap: 'wrap', gap: 12 } : { gap: 12 }}>
      {options.map((o, i) => (
        <OptionCard key={o.label} o={o} i={i} on={value === o.label} picked={!!value} grid={grid} onPress={() => onPick(o.label)} />
      ))}
    </View>
  );
}

function OptionCard({ o, i, on, picked, grid, onPress }: { o: OptionDef; i: number; on: boolean; picked: boolean; grid: boolean; onPress: () => void }) {
  const rise = useSharedValue(0);
  const sel = useSharedValue(0);
  const dim = useSharedValue(0);
  useEffect(() => {
    rise.set(withDelay(i * 50, withTiming(1, { duration: 420, easing: RISE })));
  }, [rise, i]);
  useEffect(() => {
    sel.set(withTiming(on ? 1 : 0, { duration: 380, easing: motion.spring }));
    dim.set(withTiming(picked && !on ? 1 : 0, { duration: 220, easing: motion.tabEase }));
  }, [on, picked, sel, dim]);
  const card = useAnimatedStyle(() => ({
    opacity: rise.get() * (1 - 0.45 * dim.get()),
    transform: [{ translateY: 18 * (1 - rise.get()) }, { scale: 1 + 0.015 * sel.get() - 0.015 * dim.get() }],
  }));
  const disc = useAnimatedStyle(() => ({ transform: [{ scale: 1 + 0.08 * sel.get() }] }));
  const check = useAnimatedStyle(() => ({ opacity: sel.get(), transform: [{ scale: sel.get() }] }));
  return (
    <Animated.View style={[grid ? { width: '48%', flexGrow: 1 } : { width: '100%' }, card]}>
      <Press
        onPress={onPress}
        accessibilityRole="button"
        accessibilityState={{ selected: on }}
        style={{
          borderRadius: 22,
          minHeight: grid ? 150 : 0,
          paddingTop: grid ? 20 : 18,
          paddingHorizontal: grid ? 18 : 20,
          paddingBottom: 18,
          flexDirection: grid ? 'column' : 'row',
          alignItems: grid ? 'flex-start' : 'center',
          gap: 16,
          backgroundColor: on ? color.blueTint : color.card,
          boxShadow: on ? `0 0 0 2px ${color.blue}, 0 10px 24px rgba(27,166,238,0.22)` : picked ? '0 1px 2px rgba(16,24,40,0.04)' : '0 1px 2px rgba(16,24,40,0.04), 0 6px 16px rgba(16,24,40,0.06)',
        }}
      >
        <Animated.View style={[{ width: 48, height: 48, borderRadius: 999, backgroundColor: on ? color.blue : color.blueTint, alignItems: 'center', justifyContent: 'center' }, disc]}>
          <Icon name={o.icon} size={26} color={on ? color.white : color.blueDeep} />
        </Animated.View>
        <View style={{ flex: grid ? 0 : 1, minWidth: 0 }}>
          <Text style={{ fontSize: 17, lineHeight: 22, fontWeight: '700', letterSpacing: -0.2, color: on ? color.blueDeep : color.ink }}>{o.label}</Text>
          <Text style={{ marginTop: 3, fontSize: 13, lineHeight: 18, color: color.grey4 }}>{o.sub}</Text>
        </View>
        <Animated.View style={[{ position: 'absolute', top: 14, right: 14, width: 24, height: 24, borderRadius: 999, backgroundColor: color.blue, alignItems: 'center', justifyContent: 'center' }, check]}>
          <Icon name="check" size={16} weight={700} color={color.white} />
        </Animated.View>
      </Press>
    </Animated.View>
  );
}
