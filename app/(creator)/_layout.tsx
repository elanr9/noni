import { Redirect, Stack } from 'expo-router';

import { LoadingScreen } from '../../components/Screen';
import { useAuth } from '../../lib/auth';
import { color } from '../../theme/tokens';

export default function CreatorLayout() {
  const { session, profile, loading } = useAuth();

  if (loading) return <LoadingScreen />;
  if (!session) return <Redirect href="/(auth)/login" />;
  if (!profile || !profile.onboarded) {
    return <Redirect href="/(onboarding)" />;
  }
  if (profile.role !== 'creator') {
    return <Redirect href="/(admin)/(tabs)" />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: color.offWhite },
      }}
    >
      <Stack.Screen name="(tabs)" />
      <Stack.Screen
        name="balance"
        options={{
          headerShown: true,
          title: 'Balance',
          headerShadowVisible: false,
          headerStyle: { backgroundColor: color.offWhite },
          headerTintColor: color.ink,
        }}
      />
      <Stack.Screen name="task/[id]" />
      <Stack.Screen name="record/[id]" options={{ presentation: 'fullScreenModal' }} />
    </Stack>
  );
}
