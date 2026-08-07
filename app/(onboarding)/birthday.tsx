import { useState } from 'react';
import { router } from 'expo-router';

import {
  DateWheel,
  type WheelDate,
} from '../../components/OnboardingUI';
import {
  getOnboardingAnswers,
  setOnboardingAnswer,
} from '../../lib/onboarding';
import { OnboardingShell } from './_shell';

function initialDate(): WheelDate {
  const saved = getOnboardingAnswers().birthday;
  if (saved) {
    const [y, m, d] = saved.split('-').map(Number);
    if (y && m && d) return { year: y, month: m - 1, day: d };
  }
  return { year: 2000, month: 0, day: 1 };
}

function toIso(date: WheelDate): string {
  const mm = String(date.month + 1).padStart(2, '0');
  const dd = String(date.day).padStart(2, '0');
  return `${date.year}-${mm}-${dd}`;
}

export default function BirthdayScreen() {
  const [date, setDate] = useState<WheelDate>(initialDate);

  return (
    <OnboardingShell
      step={2}
      onBack={() => router.back()}
      title="When were you born?"
      subtitle="This helps us personalize Noni for you."
      primaryLabel="Continue"
      onPrimary={() => {
        setOnboardingAnswer('birthday', toIso(date));
        router.push('/(onboarding)/phone-number');
      }}
    >
      <DateWheel value={date} onChange={setDate} />
    </OnboardingShell>
  );
}
