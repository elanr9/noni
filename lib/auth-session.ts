import * as QueryParams from 'expo-auth-session/build/QueryParams';
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { router } from 'expo-router';
import { Platform } from 'react-native';

import { resolveMode } from './active-mode';
import { destinationForProfile } from './profile';
import { supabase } from './supabase';
import type { Profile } from './profile';

/**
 * Public HTTPS callback on the marketing site. Expo Go's exp://192.168…
 * redirects are rejected by Supabase (private IP check), which previously
 * fell back to the Site URL homepage. `?app=1` tells noni-web not to consume
 * the PKCE code and to bounce straight to noni://auth/callback instead.
 */
const HTTPS_AUTH_CALLBACK = 'https://www.usenoni.app/auth/callback?app=1';

/**
 * iOS's auth session can only auto-capture a custom-scheme redirect (an
 * https return URL needs the Associated Domains entitlement, which this app
 * does not ship). The web callback page redirects here with the PKCE code.
 */
const NATIVE_RETURN_URL = 'noni://auth/callback';

export function getAuthRedirectUri(): string {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.location?.origin) {
      return `${window.location.origin}/auth/callback`;
    }
    return HTTPS_AUTH_CALLBACK;
  }
  // Expo Go private IPs are rejected by Supabase, so bounce via the
  // marketing HTTPS callback. TestFlight / store builds use the custom
  // scheme directly so ASWebAuthenticationSession never lands on the web
  // page that used to fail with "Missing auth code."
  if (Constants.appOwnership === 'expo') {
    return HTTPS_AUTH_CALLBACK;
  }
  return NATIVE_RETURN_URL;
}

export async function createSessionFromUrl(url: string): Promise<boolean> {
  const { params, errorCode } = QueryParams.getQueryParams(url);

  if (errorCode) {
    throw new Error(errorCode);
  }

  if (typeof params.code === 'string' && params.code.length > 0) {
    const { error } = await supabase.auth.exchangeCodeForSession(params.code);
    if (error) throw error;
    return true;
  }

  const accessToken = params.access_token;
  const refreshToken = params.refresh_token;

  if (!accessToken || !refreshToken) {
    return false;
  }

  const { error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  if (error) {
    throw error;
  }

  return true;
}

export function getInitialAuthUrl(): Promise<string | null> {
  return Linking.getInitialURL();
}

async function loadProfile(userId: string): Promise<Profile | null> {
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  return data as Profile | null;
}

export async function routeAfterSignIn(): Promise<void> {
  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id;
  if (!userId) {
    router.replace('/(auth)/login');
    return;
  }

  await supabase.rpc('claim_pending_invite');

  let profile = await loadProfile(userId);
  for (let i = 0; i < 4 && !profile; i += 1) {
    await new Promise((r) => setTimeout(r, 250));
    profile = await loadProfile(userId);
  }

  const mode = profile ? await resolveMode(profile) : null;
  router.replace(destinationForProfile(profile, true, mode));
}

export async function signInWithGoogle(): Promise<boolean> {
  const redirectTo = getAuthRedirectUri();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      skipBrowserRedirect: true,
    },
  });
  if (error) throw error;
  if (!data.url) {
    throw new Error('Google sign in did not return an auth URL');
  }

  // Web: the browser lands back on origin/auth/callback. Native store
  // builds set redirectTo to noni:// so the auth session captures the
  // PKCE code without the marketing-site hop. Expo Go still uses that hop.
  const returnUrl =
    Platform.OS === 'web'
      ? (redirectTo.split('?')[0] ?? redirectTo)
      : NATIVE_RETURN_URL;
  const result = await WebBrowser.openAuthSessionAsync(data.url, returnUrl);
  if (result.type !== 'success' || !result.url) {
    // The session can end "dismissed" while the noni:// deep link still
    // opens /auth/callback, which finishes the exchange. Not an error here.
    return false;
  }

  const signedIn = await createSessionFromUrl(result.url);
  if (!signedIn) {
    throw new Error(
      'Google sign in finished but no session was returned. Try again.',
    );
  }
  return true;
}

