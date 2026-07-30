import { Redirect, Stack } from 'expo-router';

import { LoadingScreen } from '../../components/Screen';
import { useAuth } from '../../lib/auth';
import { destinationForProfile } from '../../lib/profile';

export default function OnboardingLayout() {
  const { session, profile, loading } = useAuth();

  if (loading) return <LoadingScreen />;
  if (!session) return <Redirect href="/(auth)/login" />;

  if (profile?.onboarded) {
    return (
      <Redirect
        href={destinationForProfile(profile, true)}
      />
    );
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
