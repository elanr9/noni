import { useState } from 'react';
import { router } from 'expo-router';

import { CalOption, CalShell } from '../../components/OnboardingUI';
import {
  getOnboardingAnswers,
  setOnboardingAnswer,
  type HoursPerWeek,
} from '../../lib/onboarding';

const TOTAL = 12;

const OPTIONS: { key: HoursPerWeek; label: string }[] = [
  { key: '2', label: 'About 2 hours' },
  { key: '5', label: 'About 5 hours' },
  { key: '10', label: 'About 10 hours' },
  { key: '15+', label: '15 hours or more' },
];

export default function HoursScreen() {
  const [selected, setSelected] = useState<HoursPerWeek | null>(
    getOnboardingAnswers().hoursPerWeek,
  );

  return (
    <CalShell
      progress={6 / TOTAL}
      onBack={() => router.back()}
      title="How many hours a week will you put into Noni?"
      primaryLabel="Continue"
      primaryDisabled={!selected}
      onPrimary={() => {
        if (!selected) return;
        setOnboardingAnswer('hoursPerWeek', selected);
        router.push('/(onboarding)/estimate');
      }}
    >
      {OPTIONS.map((o) => (
        <CalOption
          key={o.key}
          label={o.label}
          selected={selected === o.key}
          onPress={() => setSelected(o.key)}
        />
      ))}
    </CalShell>
  );
}
