import { Redirect, Stack } from 'expo-router';

import { LoadingScreen } from '../../components/Screen';
import { useAuth } from '../../lib/auth';

export default function AdminLayout() {
  const { session, profile, loading } = useAuth();

  if (loading) return <LoadingScreen />;
  if (!session) return <Redirect href="/(auth)/login" />;
  if (!profile || !profile.onboarded) {
    return <Redirect href="/(onboarding)" />;
  }
  if (profile.role !== 'admin') {
    return <Redirect href="/(creator)" />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerShadowVisible: false,
        headerStyle: { backgroundColor: '#F7F5F2' },
        headerTintColor: '#0B0B0F',
        contentStyle: { backgroundColor: '#F7F5F2' },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Queue', headerShown: false }} />
      <Stack.Screen name="review/[id]" options={{ title: 'Review' }} />
      <Stack.Screen name="calendar" options={{ title: 'Calendar' }} />
      <Stack.Screen name="trends" options={{ title: 'Trends' }} />
      <Stack.Screen name="settings" options={{ title: 'Settings' }} />
    </Stack>
  );
}
