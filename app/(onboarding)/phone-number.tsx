import { useState } from 'react';
import { router } from 'expo-router';

import { TextField } from '../../components/ui/TextField';
import {
  formatUsPhone,
  getOnboardingAnswers,
  setOnboardingAnswer,
} from '../../lib/onboarding';
import { OnboardingShell } from './_shell';

export default function PhoneNumberScreen() {
  const [digits, setDigits] = useState(getOnboardingAnswers().phoneDigits);

  return (
    <OnboardingShell
      step={3}
      onBack={() => router.back()}
      title="What's your phone number?"
      subtitle="So we can reach you about your posts and payouts."
      primaryLabel="Continue"
      primaryDisabled={digits.length !== 10}
      onPrimary={() => {
        setOnboardingAnswer('phoneDigits', digits);
        router.push('/(onboarding)/experience');
      }}
    >
      <TextField
        value={formatUsPhone(digits)}
        onChangeText={(t) => setDigits(t.replace(/\D/g, '').slice(0, 10))}
        placeholder="(555) 123 4567"
        autoFocus
        keyboardType="number-pad"
        textContentType="telephoneNumber"
      />
    </OnboardingShell>
  );
}
