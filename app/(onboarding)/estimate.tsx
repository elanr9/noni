import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { CountUp } from '../../components/states';
import {
  getOnboardingAnswers,
  HOURS_TO_MONTHLY_ESTIMATE,
} from '../../lib/onboarding';
import { color, space, type } from '../../theme/tokens';
import { OnboardingShell } from './_shell';

export default function EstimateScreen() {
  const hours = getOnboardingAnswers().hoursPerWeek ?? '5';
  const target = HOURS_TO_MONTHLY_ESTIMATE[hours];
  const hoursLabel = hours === '15+' ? '15 or more' : hours;

  return (
    <OnboardingShell
      step={7}
      onBack={() => router.back()}
      title="Here's what that's worth"
      primaryLabel="Continue"
      onPrimary={() => router.push('/(onboarding)/save')}
    >
      <View style={styles.payoff}>
        <CountUp value={target} prefix="$" style={styles.amount} />
        <Text style={styles.perMonth}>per month</Text>
        <Text style={styles.copy}>
          Creators posting {hoursLabel} hours a week average $
          {target.toLocaleString('en-US')}/month.
        </Text>
      </View>
    </OnboardingShell>
  );
}

const styles = StyleSheet.create({
  payoff: {
    alignItems: 'center',
    paddingTop: space.sectionGap,
    gap: space[2],
  },
  amount: {
    fontSize: type.size.hero,
    fontWeight: type.weight.heavy,
    color: color.ink,
    letterSpacing: type.tracking.hero,
  },
  perMonth: {
    fontSize: type.size.card,
    fontWeight: type.weight.semibold,
    color: color.slate500,
  },
  copy: {
    marginTop: space[8],
    fontSize: type.size.action,
    lineHeight: type.size.action * type.leading.body,
    color: color.ink,
    textAlign: 'center',
    paddingHorizontal: space[3],
  },
});
