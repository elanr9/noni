import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { AuthProvider } from '../lib/auth';
import {
  createSessionFromUrl,
  getInitialAuthUrl,
} from '../lib/auth-session';

WebBrowser.maybeCompleteAuthSession();

export default function RootLayout() {
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
      <Stack screenOptions={{ headerShown: false, animation: 'fade' }} />
    </AuthProvider>
  );
}
