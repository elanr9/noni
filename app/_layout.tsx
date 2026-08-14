import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import {
  TikTokSans_700Bold,
  useFonts,
} from '@expo-google-fonts/tiktok-sans';

import { ConfigErrorScreen } from '../components/Screen';
import { AuthProvider } from '../lib/auth';
import {
  createSessionFromUrl,
  getInitialAuthUrl,
} from '../lib/auth-session';
import { missingSupabaseEnv } from '../lib/supabase';
import { motion, screenTransition } from '../theme/tokens';

WebBrowser.maybeCompleteAuthSession();

export default function RootLayout() {
  if (missingSupabaseEnv.length > 0) {
    return <ConfigErrorScreen missing={missingSupabaseEnv} />;
  }

  return <App />;
}

function App() {
  // TikTok Sans backs the on-screen text previews (record screen and the
  // admin style editor) so what creators see matches the rendered captions.
  // Rendering proceeds with the system font until it loads; no gate needed.
  useFonts({ TikTokSans_700Bold });

  useEffect(() => {
    void getInitialAuthUrl().then((url) => {
      if (url) void createSessionFromUrl(url).catch(console.error);
    });

    const sub = Linking.addEventListener('url', ({ url }) => {
      void createSessionFromUrl(url).catch(console.error);
    });

    return () => sub.remove();
  }, []);

  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          animation: screenTransition.fade,
          animationDuration: motion.base,
        }}
      />
    </AuthProvider>
  );
}
