import { Redirect, Stack } from 'expo-router';

import { LoadingScreen } from '../../components/Screen';
import { useAuth } from '../../lib/auth';
import { profileCanCreate, profileIsAdmin } from '../../lib/active-mode';
import { color } from '../../theme/tokens';

export default function AdminLayout() {
  const { session, profile, loading, activeMode } = useAuth();

  if (loading) return <LoadingScreen />;
  if (!session) return <Redirect href="/(auth)/login" />;
  if (!profile || !profile.onboarded) {
    return <Redirect href="/(onboarding)" />;
  }
  // Pure admins always stay here. Dual users leave only in creator mode.
  // Never bounce a non-dual admin to creator (avoids redirect loops / TestFlight hangs).
  if (!profileIsAdmin(profile)) {
    return <Redirect href="/(creator)/(tabs)" />;
  }
  if (profileCanCreate(profile) && activeMode === 'creator') {
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
      <Stack.Screen name="creator/post/[assignmentId]" options={{ title: 'Post' }} />
      <Stack.Screen name="chat/[creatorId]" options={{ title: 'Chat' }} />
      <Stack.Screen
        name="account-approval/[accountId]"
        options={{ title: 'Account approval' }}
      />
      <Stack.Screen name="account-template" options={{ title: 'Account template' }} />
      <Stack.Screen name="brain" options={{ title: 'Brand Brain' }} />
      <Stack.Screen name="features" options={{ title: 'Features' }} />
      <Stack.Screen name="billing" options={{ title: 'Billing & budget' }} />
      <Stack.Screen name="week-setup" options={{ title: 'New week' }} />
      <Stack.Screen name="week/[id]" options={{ title: 'Week' }} />
      <Stack.Screen name="post/[id]" options={{ title: 'Post' }} />
    </Stack>
  );
}
