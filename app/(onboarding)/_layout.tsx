import { useEffect, useState } from 'react';
import { Redirect, Stack } from 'expo-router';

import { LoadingScreen } from '../../components/layout/Screen';
import { useAuth } from '../../lib/auth';
import { hydrateOnboardingAnswers } from '../../lib/onboarding';
import { destinationForProfile } from '../../lib/profile';
import { motion, screenTransition } from '../../theme/tokens';

// Onboarding runs after an invited sign-in. Users without a session or
// without a profile get bounced to sign in; onboarded users go to their app.
export default function OnboardingLayout() {
  const { session, profile, loading, activeMode } = useAuth();
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    void hydrateOnboardingAnswers().finally(() => setHydrated(true));
  }, []);

  if (loading || !hydrated) return <LoadingScreen />;

  if (!session || !profile || profile.onboarded) {
    return (
      <Redirect
        href={destinationForProfile(profile, session !== null, activeMode)}
      />
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: screenTransition.push,
        animationDuration: motion.base,
      }}
    />
  );
}
