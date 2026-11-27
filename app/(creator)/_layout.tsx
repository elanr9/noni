import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Redirect, Stack, usePathname } from 'expo-router';

import {
  profileCanCreate,
  profileIsCampaignManager,
  profileIsPlatformAdmin,
} from '../../lib/active-mode';
import { useAuth } from '../../lib/auth';
import { CreatorQueueProvider } from '../../lib/creator-queue';
import { usePendingAgreement } from '../../lib/pending-agreement';
import { trackPresence } from '../../lib/presence';
import { isSetupCompleteFlag, useSetupState } from '../../lib/setup';
import { color, motion, screenTransition } from '../../theme/v2';

/**
 * Routes a creator may use before setup is complete. Everything else
 * redirects to Home, which shows the checklist until setup is done.
 * Setup routes themselves, chat, and profile stay reachable so the gate
 * can never loop. Create stays reachable so its sheet can say what is left
 * to finish instead of the button doing nothing.
 */
const SETUP_EXEMPT = [
  '/setup',
  '/account-setup',
  '/settings',
  '/chat',
  '/messages',
  '/channel',
  '/profile',
  '/posts',
  '/earnings',
  '/payouts',
  '/create',
  '/assignment',
  // The marketplace belongs to the person, not to one company's setup.
  '/market',
];

function isSetupExempt(pathname: string): boolean {
  // Creator Home tab is `/` inside this stack.
  if (pathname === '/' || pathname === '/index') return true;
  return SETUP_EXEMPT.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function LoadingScreen() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: color.bg }}>
      <ActivityIndicator color={color.grey4} />
    </View>
  );
}

export default function CreatorLayout() {
  const { session, profile, loading, activeMode } = useAuth();
  const pathname = usePathname();

  const inCreatorMode =
    !!profile &&
    profile.onboarded === true &&
    profileCanCreate(profile) &&
    (!profileIsPlatformAdmin(profile) || activeMode === 'creator');
  const setupFlagged =
    inCreatorMode &&
    isSetupCompleteFlag(profile.onboarding_answers, profile.active_company_id);
  const setup = useSetupState(inCreatorMode && !setupFlagged ? profile : null);

  // Managers see a green dot on the creator's inbox row while the app is open.
  const presenceCompanyId = inCreatorMode ? profile.active_company_id : null;
  const presenceProfileId = inCreatorMode ? profile.id : null;
  useEffect(() => {
    if (presenceCompanyId === null || presenceProfileId === null) return;
    return trackPresence(presenceCompanyId, presenceProfileId);
  }, [presenceCompanyId, presenceProfileId]);

  // A company said yes: the agreement to sign opens first.
  usePendingAgreement(inCreatorMode ? profile.id : null);

  if (loading) return <LoadingScreen />;
  if (!session) return <Redirect href="/(auth)/login" />;
  // The platform admin runs this surface only in creator mode.
  if (profile && profileIsPlatformAdmin(profile) && activeMode !== 'creator') {
    return (
      <Redirect
        href={activeMode === 'admin' ? '/(admin)/(tabs)' : '/platform-admin'}
      />
    );
  }
  if (!profile || !profile.onboarded) {
    return <Redirect href="/(onboarding)" />;
  }
  if (!inCreatorMode) {
    if (profileIsPlatformAdmin(profile)) {
      return <Redirect href="/platform-admin" />;
    }
    if (profileIsCampaignManager(profile)) {
      return <Redirect href="/(admin)/(tabs)" />;
    }
    return <Redirect href="/(auth)/login" />;
  }

  const exempt = isSetupExempt(pathname);
  if (!setupFlagged && !exempt) {
    if (setup.state === null) return <LoadingScreen />;
    if (!setup.state.complete) return <Redirect href="/(creator)/(tabs)" />;
  }

  return (
    <CreatorQueueProvider>
        <Stack
          screenOptions={{
            headerShown: false,
            headerBackButtonDisplayMode: 'minimal',
            contentStyle: { backgroundColor: color.bg },
            animation: screenTransition.push,
            animationDuration: motion.push,
          }}
        >
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="create" options={{ presentation: 'transparentModal', animation: 'none', contentStyle: { backgroundColor: 'transparent' } }} />
          <Stack.Screen name="briefs" />
          <Stack.Screen name="market/[id]" />
          <Stack.Screen name="market/profile" />
          <Stack.Screen name="resume/[id]" options={{ presentation: 'transparentModal', animation: 'fade', animationDuration: motion.press * 2, contentStyle: { backgroundColor: 'transparent' } }} />
          <Stack.Screen name="assignment/[id]" />
          <Stack.Screen name="outline/[id]" />
          <Stack.Screen name="capture" options={{ presentation: 'fullScreenModal', animation: screenTransition.modal, animationDuration: motion.push }} />
          <Stack.Screen name="edit/[id]" options={{ presentation: 'fullScreenModal', animation: screenTransition.modal, animationDuration: motion.push }} />
          <Stack.Screen name="slides/[id]" options={{ presentation: 'fullScreenModal', animation: screenTransition.modal, animationDuration: motion.push }} />
          <Stack.Screen name="payouts" options={{ headerShown: false }} />
          <Stack.Screen name="chat" options={{ headerShown: false }} />
          <Stack.Screen name="channel/[chatId]" options={{ headerShown: false }} />
          <Stack.Screen name="account-setup" options={{ headerShown: false }} />
          <Stack.Screen name="settings" options={{ headerShown: false }} />
          <Stack.Screen name="setup/index" />
          <Stack.Screen name="setup/connect" options={{ headerShown: false }} />
          <Stack.Screen name="setup/warmup" options={{ headerShown: false }} />
          <Stack.Screen name="posts/[id]" />
        </Stack>
    </CreatorQueueProvider>
  );
}
