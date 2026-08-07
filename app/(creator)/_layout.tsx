import { Redirect, Stack, usePathname } from 'expo-router';

import { LoadingScreen } from '../../components/Screen';
import { useAuth } from '../../lib/auth';
import { isSetupCompleteFlag, useSetupState } from '../../lib/setup';
import { color } from '../../theme/tokens';

/**
 * Routes a creator may use before setup is complete. Everything else
 * redirects to the setup checklist. Setup routes themselves, chat, and
 * profile stay reachable so the gate can never loop.
 */
const SETUP_EXEMPT = [
  '/setup',
  '/account-setup',
  '/chat',
  '/messages',
  '/profile',
  '/balance',
  '/kitchen-sink',
];

export default function CreatorLayout() {
  const { session, profile, loading } = useAuth();
  const pathname = usePathname();

  const isCreator = profile?.role === 'creator' && profile.onboarded === true;
  const setupFlagged = isCreator && isSetupCompleteFlag(profile.onboarding_answers);
  const setup = useSetupState(isCreator && !setupFlagged ? profile : null);

  if (loading) return <LoadingScreen />;
  if (!session) return <Redirect href="/(auth)/login" />;
  if (!profile || !profile.onboarded) {
    return <Redirect href="/(onboarding)" />;
  }
  if (profile.role !== 'creator') {
    return <Redirect href="/(admin)/(tabs)" />;
  }

  const exempt = SETUP_EXEMPT.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  if (!setupFlagged && !exempt) {
    if (setup.state === null) return <LoadingScreen />;
    if (!setup.state.complete) return <Redirect href="/(creator)/setup" />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: color.offWhite },
      }}
    >
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="kitchen-sink" options={{ headerShown: true, title: 'UI kit' }} />
      <Stack.Screen name="balance" options={{ headerShown: false }} />
      <Stack.Screen name="chat" options={{ headerShown: false }} />
      <Stack.Screen name="messages/index" options={{ headerShown: false }} />
      <Stack.Screen
        name="account-setup"
        options={{
          headerShown: true,
          title: 'Account setup',
          headerShadowVisible: false,
          headerStyle: { backgroundColor: color.offWhite },
          headerTintColor: color.ink,
        }}
      />
      <Stack.Screen name="setup/index" />
      <Stack.Screen
        name="setup/warmup"
        options={{
          headerShown: true,
          title: 'Warm up',
          headerShadowVisible: false,
          headerStyle: { backgroundColor: color.offWhite },
          headerTintColor: color.ink,
        }}
      />
      <Stack.Screen name="record/[id]" options={{ presentation: 'fullScreenModal' }} />
      <Stack.Screen name="post/[id]" />
      <Stack.Screen name="posts/[id]" />
    </Stack>
  );
}
