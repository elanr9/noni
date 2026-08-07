import { useEffect, useState } from 'react';
import { Redirect, Stack } from 'expo-router';

import { LoadingScreen } from '../../components/Screen';
import { useAuth } from '../../lib/auth';
import { hydrateOnboardingAnswers } from '../../lib/onboarding';
import { destinationForProfile } from '../../lib/profile';

// Onboarding runs WITHOUT a session (steps 0 to 7); auth happens mid-flow
// at the save step. Only already-onboarded users get bounced to their app.
export default function OnboardingLayout() {
  const { profile, loading } = useAuth();
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    void hydrateOnboardingAnswers().finally(() => setHydrated(true));
  }, []);

  if (loading || !hydrated) return <LoadingScreen />;

  if (profile?.onboarded) {
    return <Redirect href={destinationForProfile(profile, true)} />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
