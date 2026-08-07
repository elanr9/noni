import { useState } from 'react';
import { router } from 'expo-router';

import { CalOption, CalShell } from '../../components/OnboardingUI';
import {
  getOnboardingAnswers,
  setOnboardingAnswer,
  type HardestPart,
} from '../../lib/onboarding';

const TOTAL = 12;

const OPTIONS: { key: HardestPart; label: string }[] = [
  { key: 'getting_views', label: 'Getting views' },
  { key: 'knowing_what_to_post', label: 'Knowing what to post' },
  { key: 'staying_consistent', label: 'Staying consistent' },
  { key: 'getting_paid', label: 'Getting paid at all' },
];

export default function HardestScreen() {
  const [selected, setSelected] = useState<HardestPart | null>(
    getOnboardingAnswers().hardestPart,
  );

  return (
    <CalShell
      progress={5 / TOTAL}
      onBack={() => router.back()}
      title="What's been hardest about making money online?"
      primaryLabel="Continue"
      primaryDisabled={!selected}
      onPrimary={() => {
        if (!selected) return;
        setOnboardingAnswer('hardestPart', selected);
        router.push('/(onboarding)/hours');
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
