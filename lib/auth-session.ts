import * as AppleAuthentication from 'expo-apple-authentication';
import * as QueryParams from 'expo-auth-session/build/QueryParams';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { router } from 'expo-router';
import { Platform } from 'react-native';

import { markOnboardedLocally } from './onboarding';
import { resolveMode } from './active-mode';
import { destinationForProfile } from './profile';
import { supabase } from './supabase';
import type { Profile } from './profile';

/**
 * Public HTTPS callback on the marketing site. Expo Go's exp://192.168…
 * redirects are rejected by Supabase (private IP check), which previously
 * fell back to the Site URL homepage. `?app=1` tells noni-web not to consume
 * the PKCE code so this client can exchange it.
 */
const HTTPS_AUTH_CALLBACK = 'https://www.usenoni.app/auth/callback?app=1';

export function getAuthRedirectUri(): string {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.location?.origin) {
      return `${window.location.origin}/auth/callback`;
    }
    return HTTPS_AUTH_CALLBACK;
  }
  return HTTPS_AUTH_CALLBACK;
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

export async function routeAfterSignIn(): Promise<void> {
  const { data } = await supabase.auth.getUser();

  let profile: Profile | null = null;
  if (data.user) {
    const { data: row } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', data.user.id)
      .maybeSingle();
    profile = row;
  }

  if (profile?.onboarded) {
    await markOnboardedLocally();
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

  // Prefix match: session completes when the browser lands on /auth/callback
  const result = await WebBrowser.openAuthSessionAsync(
    data.url,
    'https://www.usenoni.app/auth/callback',
  );
  if (result.type !== 'success' || !result.url) {
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

export async function signInWithApple(): Promise<boolean> {
  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
  } catch (e) {
    if (
      e instanceof Error &&
      'code' in e &&
      (e as { code?: string }).code === 'ERR_REQUEST_CANCELED'
    ) {
      return false;
    }
    throw e;
  }

  if (!credential.identityToken) {
    throw new Error('Apple did not return an identity token');
  }

  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
  });
  if (error) throw error;
  return true;
}
