import { Redirect, Stack, usePathname } from 'expo-router';

import { LoadingScreen } from '../../components/Screen';
import { profileCanCreate, profileIsAdmin } from '../../lib/active-mode';
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
  const { session, profile, loading, activeMode } = useAuth();
  const pathname = usePathname();

  const inCreatorMode =
    !!profile &&
    profile.onboarded === true &&
    profileCanCreate(profile) &&
    (!profileIsAdmin(profile) || activeMode === 'creator');
  const setupFlagged =
    inCreatorMode && isSetupCompleteFlag(profile.onboarding_answers);
  const setup = useSetupState(inCreatorMode && !setupFlagged ? profile : null);

  if (loading) return <LoadingScreen />;
  if (!session) return <Redirect href="/(auth)/login" />;
  if (!profile || !profile.onboarded) {
    return <Redirect href="/(onboarding)" />;
  }
  if (!inCreatorMode) {
    // Dual admin in admin mode, or anyone who cannot create → admin app.
    // Pure creators always pass inCreatorMode above.
    if (profileIsAdmin(profile)) {
      return <Redirect href="/(admin)/(tabs)" />;
    }
    return <Redirect href="/(auth)/login" />;
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
      <Stack.Screen name="record/changes/[id]" />
      <Stack.Screen name="upload/[id]" options={{ presentation: 'fullScreenModal' }} />
      <Stack.Screen name="post/[id]" />
      <Stack.Screen name="posts/[id]" />
    </Stack>
  );
}
