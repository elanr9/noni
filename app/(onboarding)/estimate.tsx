import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { cal, CalShell } from '../../components/OnboardingUI';
import {
  getOnboardingAnswers,
  HOURS_TO_MONTHLY_ESTIMATE,
} from '../../lib/onboarding';

const TOTAL = 12;

export default function EstimateScreen() {
  const hours = getOnboardingAnswers().hoursPerWeek ?? '5';
  const target = HOURS_TO_MONTHLY_ESTIMATE[hours];
  const hoursLabel = hours === '15+' ? '15 or more' : hours;

  const anim = useRef(new Animated.Value(0)).current;
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const sub = anim.addListener(({ value }) => setDisplay(Math.round(value)));
    Animated.timing(anim, {
      toValue: target,
      duration: 1400,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
    return () => anim.removeListener(sub);
  }, [anim, target]);

  return (
    <CalShell
      progress={7 / TOTAL}
      onBack={() => router.back()}
      title="Here's what that's worth"
      primaryLabel="Continue"
      onPrimary={() => router.push('/(onboarding)/save')}
    >
      <View style={styles.payoff}>
        <Text style={styles.amount}>${display.toLocaleString('en-US')}</Text>
        <Text style={styles.perMonth}>per month</Text>
        <Text style={styles.copy}>
          Creators posting {hoursLabel} hours a week average $
          {target.toLocaleString('en-US')}/month.
        </Text>
      </View>
    </CalShell>
  );
}

const styles = StyleSheet.create({
  payoff: { alignItems: 'center', paddingTop: 48, gap: 6 },
  amount: {
    fontSize: 72,
    fontWeight: '800',
    color: cal.ink,
    letterSpacing: -2,
  },
  perMonth: { fontSize: 18, fontWeight: '600', color: cal.sub },
  copy: {
    marginTop: 24,
    fontSize: 17,
    lineHeight: 25,
    color: cal.ink,
    textAlign: 'center',
    paddingHorizontal: 12,
  },
});
