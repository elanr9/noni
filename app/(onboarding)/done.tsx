import { useState } from 'react';
import { Alert } from 'react-native';
import { router } from 'expo-router';

import { useAuth } from '../../lib/auth';
import {
  clearOnboardingAnswers,
  completeOnboarding,
} from '../../lib/onboarding';
import { OnboardingShell } from './_shell';

export default function DoneScreen() {
  const { session, refreshProfile } = useAuth();
  const [busy, setBusy] = useState(false);

  async function finish() {
    if (!session) return;
    setBusy(true);
    try {
      await completeOnboarding(session.user.id);
      await clearOnboardingAnswers();
      await refreshProfile();
      router.replace('/(creator)/(tabs)');
    } catch (e) {
      setBusy(false);
      Alert.alert('Could not finish', e instanceof Error ? e.message : 'Try again');
    }
  }

  return (
    <OnboardingShell
      step={11}
      onBack={() => router.back()}
      title="You're in."
      subtitle="Next: set up your accounts."
      primaryLabel={busy ? 'Opening Noni' : "Let's go"}
      primaryDisabled={busy}
      onPrimary={() => void finish()}
    />
  );
}
