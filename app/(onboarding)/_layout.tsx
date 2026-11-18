import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Redirect, Stack } from 'expo-router';

import { useAuth } from '../../lib/auth';
import { hydrateOnboardingAnswers } from '../../lib/onboarding';
import { destinationForProfile } from '../../lib/profile';
import { color, motion, screenTransition } from '../../theme/v2';

function Loading() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: color.bg }}>
      <ActivityIndicator color={color.grey4} />
    </View>
  );
}

// Onboarding runs after an invited sign-in. Users without a session or
// without a profile get bounced to sign in; onboarded users go to their app.
export default function OnboardingLayout() {
  const { session, profile, loading, activeMode } = useAuth();
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    void hydrateOnboardingAnswers().finally(() => setHydrated(true));
  }, []);

  if (loading || !hydrated) return <Loading />;

  if (!session || !profile || profile.onboarded) {
    return <Redirect href={destinationForProfile(profile, session !== null, activeMode)} />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: color.bg },
        animation: screenTransition.push,
        animationDuration: motion.push,
      }}
    >
      <Stack.Screen name="practice" options={{ animation: screenTransition.modal }} />
      <Stack.Screen name="done" options={{ animation: screenTransition.fade, gestureEnabled: false }} />
    </Stack>
  );
}
