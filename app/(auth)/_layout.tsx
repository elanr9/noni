import { Redirect, Stack } from 'expo-router';

import { LoadingScreen } from '../../components/Screen';
import { useAuth } from '../../lib/auth';
import { destinationForProfile } from '../../lib/profile';

export default function AuthLayout() {
  const { session, profile, loading, activeMode } = useAuth();

  if (loading) {
    return <LoadingScreen />;
  }

  if (session) {
    const dest = destinationForProfile(profile, true, activeMode);
    if (dest !== '/(auth)/login' && dest !== '/(auth)/invite-required') {
      return <Redirect href={dest} />;
    }
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
