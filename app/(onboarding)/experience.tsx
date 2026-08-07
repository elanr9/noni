import { useState } from 'react';
import { router } from 'expo-router';

import { CalOption, CalShell } from '../../components/OnboardingUI';
import {
  getOnboardingAnswers,
  setOnboardingAnswer,
  type UgcExperience,
} from '../../lib/onboarding';

const TOTAL = 12;

const OPTIONS: { key: UgcExperience; label: string }[] = [
  { key: 'never_heard', label: 'Never heard of it' },
  { key: 'seen_around', label: "I've seen it around" },
  { key: 'made_some', label: "I've made some content" },
  { key: 'do_ugc', label: 'I do UGC already' },
];

export default function ExperienceScreen() {
  const [selected, setSelected] = useState<UgcExperience | null>(
    getOnboardingAnswers().ugcExperience,
  );

  return (
    <CalShell
      progress={4 / TOTAL}
      onBack={() => router.back()}
      title="What do you know about UGC?"
      primaryLabel="Continue"
      primaryDisabled={!selected}
      onPrimary={() => {
        if (!selected) return;
        setOnboardingAnswer('ugcExperience', selected);
        router.push('/(onboarding)/hardest');
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
