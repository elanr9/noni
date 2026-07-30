import { Redirect, Stack } from 'expo-router';

import { LoadingScreen } from '../../components/Screen';
import { useAuth } from '../../lib/auth';

export default function CreatorLayout() {
  const { session, profile, loading } = useAuth();

  if (loading) return <LoadingScreen />;
  if (!session) return <Redirect href="/(auth)/login" />;
  if (!profile || !profile.onboarded) {
    return <Redirect href="/(onboarding)" />;
  }
  if (profile.role !== 'creator') {
    return <Redirect href="/(admin)" />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerShadowVisible: false,
        headerStyle: { backgroundColor: '#F7F5F2' },
        headerTintColor: '#0B0B0F',
        headerTitleStyle: { fontWeight: '700' },
        contentStyle: { backgroundColor: '#F7F5F2' },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Today', headerShown: false }} />
      <Stack.Screen name="my-posts" options={{ title: 'My posts' }} />
      <Stack.Screen name="settings" options={{ title: 'Settings' }} />
      <Stack.Screen name="task/[id]" options={{ title: 'Task' }} />
      <Stack.Screen
        name="record/[id]"
        options={{ headerShown: false, presentation: 'fullScreenModal' }}
      />
    </Stack>
  );
}
