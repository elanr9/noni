import { useState } from 'react';
import { router } from 'expo-router';

import { OptionCard } from '../../components/ui/OptionCard';
import {
  getOnboardingAnswers,
  setOnboardingAnswer,
  type UgcExperience,
} from '../../lib/onboarding';
import { OnboardingShell } from './_shell';

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
    <OnboardingShell
      step={4}
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
        <OptionCard
          key={o.key}
          label={o.label}
          selected={selected === o.key}
          onPress={() => setSelected(o.key)}
        />
      ))}
    </OnboardingShell>
  );
}
