import { Redirect, Stack } from 'expo-router';

import { LoadingScreen } from '../../components/Screen';
import { useAuth } from '../../lib/auth';
import { color } from '../../theme/tokens';

export default function AdminLayout() {
  const { session, profile, loading } = useAuth();

  if (loading) return <LoadingScreen />;
  if (!session) return <Redirect href="/(auth)/login" />;
  if (!profile || !profile.onboarded) {
    return <Redirect href="/(onboarding)" />;
  }
  if (profile.role !== 'admin') {
    return <Redirect href="/(creator)/(tabs)" />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerShadowVisible: false,
        headerStyle: { backgroundColor: color.offWhite },
        headerTintColor: color.ink,
        contentStyle: { backgroundColor: color.offWhite },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="review/[id]" options={{ title: 'Review' }} />
      <Stack.Screen name="creator/[id]" options={{ title: 'Creator' }} />
      <Stack.Screen name="brain" options={{ title: 'Brand Brain' }} />
    </Stack>
  );
}
