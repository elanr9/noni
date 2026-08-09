import { useState } from 'react';
import { router } from 'expo-router';

import { TextField } from '../../components/ui/TextField';
import {
  getOnboardingAnswers,
  setOnboardingAnswer,
} from '../../lib/onboarding';
import { OnboardingShell } from './_shell';

export default function NameScreen() {
  const [name, setName] = useState(getOnboardingAnswers().firstName);

  return (
    <OnboardingShell
      step={1}
      onBack={() => router.back()}
      title="What's your first name?"
      primaryLabel="Continue"
      primaryDisabled={!name.trim()}
      onPrimary={() => {
        setOnboardingAnswer('firstName', name.trim());
        router.push('/(onboarding)/birthday');
      }}
    >
      <TextField
        value={name}
        onChangeText={setName}
        placeholder="First name"
        autoFocus
        autoCapitalize="words"
        autoCorrect={false}
        returnKeyType="done"
      />
    </OnboardingShell>
  );
}
