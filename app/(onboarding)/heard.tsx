import { useState } from 'react';
import { Alert } from 'react-native';
import { router } from 'expo-router';

import { OptionCard } from '../../components/ui/OptionCard';
import { useAuth } from '../../lib/auth';
import {
  getOnboardingAnswers,
  saveOnboardingAnswersToProfile,
  setOnboardingAnswer,
  type HeardFrom,
} from '../../lib/onboarding';
import { OnboardingShell } from './_shell';

const OPTIONS: { key: HeardFrom; label: string }[] = [
  { key: 'tiktok', label: 'TikTok' },
  { key: 'instagram', label: 'Instagram' },
  { key: 'friend', label: 'Friend' },
  { key: 'other', label: 'Other' },
];

export default function HeardScreen() {
  const { session } = useAuth();
  const [selected, setSelected] = useState<HeardFrom | null>(
    getOnboardingAnswers().heardFrom,
  );
  const [busy, setBusy] = useState(false);

  async function next() {
    if (!selected) return;
    setOnboardingAnswer('heardFrom', selected);
    setBusy(true);
    try {
      if (session) await saveOnboardingAnswersToProfile(session.user.id);
      router.push('/(onboarding)/notifications');
    } catch (e) {
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Try again');
    } finally {
      setBusy(false);
    }
  }

  return (
    <OnboardingShell
      step={8}
      title="How did you hear about Noni?"
      primaryLabel="Continue"
      primaryDisabled={!selected || busy}
      onPrimary={() => void next()}
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
