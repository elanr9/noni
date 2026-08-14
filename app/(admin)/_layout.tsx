import { Redirect, Stack } from 'expo-router';

import { LoadingScreen } from '../../components/Screen';
import { useAuth } from '../../lib/auth';
import {
  profileCanCreate,
  profileIsCampaignManager,
  profileIsPlatformAdmin,
} from '../../lib/active-mode';
import { color } from '../../theme/tokens';

export default function AdminLayout() {
  const { session, profile, loading, activeMode } = useAuth();

  const platformAdmin = !!profile && profileIsPlatformAdmin(profile);

  if (loading) return <LoadingScreen />;
  if (!session) return <Redirect href="/(auth)/login" />;
  // The platform admin runs this surface only in campaign manager mode.
  if (platformAdmin && activeMode !== 'admin') {
    return (
      <Redirect
        href={activeMode === 'creator' ? '/(creator)/(tabs)' : '/platform-admin'}
      />
    );
  }
  if (!profile || !profile.onboarded) {
    return <Redirect href="/(onboarding)" />;
  }
  // Pure campaign managers always stay here. Dual users leave only in creator
  // mode. Never bounce a non-dual campaign manager to creator (avoids
  // redirect loops / TestFlight hangs).
  if (!platformAdmin) {
    if (!profileIsCampaignManager(profile)) {
      return <Redirect href="/(creator)/(tabs)" />;
    }
    if (profileCanCreate(profile) && activeMode === 'creator') {
      return <Redirect href="/(creator)/(tabs)" />;
    }
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
      <Stack.Screen name="week-setup" options={{ title: 'New week', headerShown: false }} />
      <Stack.Screen name="week/[id]" options={{ title: 'Week', headerShown: false }} />
      <Stack.Screen name="week-day" options={{ title: 'Day', headerShown: false }} />
      <Stack.Screen name="messages/index" options={{ title: 'Messages', headerShown: false }} />
      <Stack.Screen name="messages/[chatId]" options={{ title: 'Chat', headerShown: false }} />
      <Stack.Screen name="post/[id]" options={{ title: 'Post', headerShown: false }} />
    </Stack>
  );
}
