import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { ShareIntentProvider } from 'expo-share-intent';
import * as SplashScreen from 'expo-splash-screen';
import { isLoaded, useFonts } from 'expo-font';

import { ConfigErrorScreen } from '../components/Screen';
import { CompanyOverlays } from '../components/shared';
import { AuthProvider } from '../lib/auth';
import { CompanyProvider } from '../lib/company-context';
import {
  createSessionFromUrl,
  getInitialAuthUrl,
} from '../lib/auth-session';
import { OVERLAY_TEXT_SPEC } from '../lib/overlay-boxes';
import { missingSupabaseEnv } from '../lib/supabase';
import { motion, screenTransition } from '../theme/tokens';

WebBrowser.maybeCompleteAuthSession();
void SplashScreen.preventAutoHideAsync();

/** The two TikTok Sans instances every on-screen text preview draws with. */
const OVERLAY_FONTS = {
  [OVERLAY_TEXT_SPEC.condensed.fontFamily]: require('../assets/fonts/TikTokSans-Condensed.ttf'),
  [OVERLAY_TEXT_SPEC.bubble.fontFamily]: require('../assets/fonts/TikTokSans-Bubble.ttf'),
};

export default function RootLayout() {
  if (missingSupabaseEnv.length > 0) {
    return <ConfigErrorScreen missing={missingSupabaseEnv} />;
  }

  return <App />;
}

function App() {
  // The splash stays up until both fonts are registered, so no text preview
  // ever draws with the system font and then swaps.
  const [fontsLoaded, fontError] = useFonts(OVERLAY_FONTS);
  const fontsReady = fontsLoaded || fontError !== null;

  useEffect(() => {
    if (!fontsReady) return;
    for (const family of Object.keys(OVERLAY_FONTS)) {
      console.log(`overlay font ${family}: ${isLoaded(family) ? 'loaded' : 'MISSING, system fallback'}`);
    }
    if (fontError) console.error('overlay fonts failed to load', fontError);
    void SplashScreen.hideAsync();
  }, [fontsReady, fontError]);

  useEffect(() => {
    void getInitialAuthUrl().then((url) => {
      if (url) void createSessionFromUrl(url).catch(console.error);
    });

    const sub = Linking.addEventListener('url', ({ url }) => {
      void createSessionFromUrl(url).catch(console.error);
    });

    return () => sub.remove();
  }, []);

  if (!fontsReady) return null;

  return (
    <ShareIntentProvider>
      <AuthProvider>
        <CompanyProvider>
          <StatusBar style="dark" />
          <Stack
            screenOptions={{
              headerShown: false,
              animation: screenTransition.fade,
              animationDuration: motion.base,
            }}
          />
          <CompanyOverlays />
        </CompanyProvider>
      </AuthProvider>
    </ShareIntentProvider>
  );
}
