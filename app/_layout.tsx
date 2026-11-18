import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { ShareIntentProvider } from 'expo-share-intent';
import * as SplashScreen from 'expo-splash-screen';
import { isLoaded, useFonts } from 'expo-font';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { ConfigErrorScreen } from '../components/Screen';
import { ICON_FONT_FILES } from '../components/v2/Icon';
import { CompanyOverlays } from '../components/shared';
import { ToastHost } from '../components/v2/Toast';
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

/** The TikTok Sans instance every on-screen text preview draws with. */
const OVERLAY_FONTS = {
  [OVERLAY_TEXT_SPEC.bubble.fontFamily]: require('../assets/fonts/TikTokSans-Bubble.ttf'),
};

/** Overlay text plus the v2 icon font instances. */
const FONTS = { ...OVERLAY_FONTS, ...ICON_FONT_FILES };

export default function RootLayout() {
  if (missingSupabaseEnv.length > 0) {
    return <ConfigErrorScreen missing={missingSupabaseEnv} />;
  }

  return <App />;
}

function App() {
  // The splash stays up until every font is registered, so no text preview
  // ever draws with the system font and no icon draws as a missing glyph.
  const [fontsLoaded, fontError] = useFonts(FONTS);
  const fontsReady = fontsLoaded || fontError !== null;

  useEffect(() => {
    if (!fontsReady) return;
    for (const family of Object.keys(FONTS)) {
      console.log(`font ${family}: ${isLoaded(family) ? 'loaded' : 'MISSING, system fallback'}`);
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
    <GestureHandlerRootView style={{ flex: 1 }}>
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
            <ToastHost />
          </CompanyProvider>
        </AuthProvider>
      </ShareIntentProvider>
    </GestureHandlerRootView>
  );
}
