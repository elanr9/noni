import { useState } from 'react';
import { router } from 'expo-router';

import { CalShell, CalTextField } from '../../components/OnboardingUI';
import {
  getOnboardingAnswers,
  setOnboardingAnswer,
} from '../../lib/onboarding';

const TOTAL = 12;

export default function NameScreen() {
  const [name, setName] = useState(getOnboardingAnswers().firstName);

  return (
    <CalShell
      progress={1 / TOTAL}
      onBack={() => router.back()}
      title="What's your first name?"
      primaryLabel="Continue"
      primaryDisabled={!name.trim()}
      onPrimary={() => {
        setOnboardingAnswer('firstName', name.trim());
        router.push('/(onboarding)/birthday');
      }}
    >
      <CalTextField
        value={name}
        onChangeText={setName}
        placeholder="First name"
        autoFocus
        autoCapitalize="words"
        autoCorrect={false}
        returnKeyType="done"
      />
    </CalShell>
  );
}
