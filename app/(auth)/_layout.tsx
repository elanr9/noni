import { Redirect, Stack } from 'expo-router';

import { LoadingScreen } from '../../components/Screen';
import { useAuth } from '../../lib/auth';
import { destinationForProfile } from '../../lib/profile';

export default function AuthLayout() {
  const { session, profile, loading } = useAuth();

  if (loading) {
    return <LoadingScreen />;
  }

  if (session) {
    const dest = destinationForProfile(profile, true);
    if (dest !== '/(auth)/login') {
      return <Redirect href={dest} />;
    }
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
