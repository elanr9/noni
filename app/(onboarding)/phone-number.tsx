import { useState } from 'react';
import { router } from 'expo-router';

import { CalShell, CalTextField } from '../../components/OnboardingUI';
import {
  formatUsPhone,
  getOnboardingAnswers,
  setOnboardingAnswer,
} from '../../lib/onboarding';

const TOTAL = 12;

export default function PhoneNumberScreen() {
  const [digits, setDigits] = useState(getOnboardingAnswers().phoneDigits);

  return (
    <CalShell
      progress={3 / TOTAL}
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
      <CalTextField
        value={formatUsPhone(digits)}
        onChangeText={(t) => setDigits(t.replace(/\D/g, '').slice(0, 10))}
        placeholder="(555) 123 4567"
        autoFocus
        keyboardType="number-pad"
        textContentType="telephoneNumber"
      />
    </CalShell>
  );
}
