import * as AppleAuthentication from 'expo-apple-authentication';
import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
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

const codeExchanges = new Map<string, Promise<boolean>>();

function exchangeCode(code: string): Promise<boolean> {
  const pending = codeExchanges.get(code);
  if (pending) return pending;
  const exchange = supabase.auth
    .exchangeCodeForSession(code)
    .then(({ error }) => {
      if (error) throw error;
      return true;
    });
  codeExchanges.set(code, exchange);
  return exchange;
}

/** Query and hash params off a callback URL; expo-auth-session no longer exports its QueryParams helper. */
function getQueryParams(input: string): { params: Record<string, string>; errorCode: string | null } {
  const url = new URL(input, 'https://phony.example');
  const errorCode = url.searchParams.get('errorCode');
  url.searchParams.delete('errorCode');
  const params: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    params[key] = value;
  });
  if (url.hash) {
    new URLSearchParams(url.hash.replace(/^#/, '')).forEach((value, key) => {
      params[key] = value;
    });
  }
  return { params, errorCode };
}

export async function createSessionFromUrl(url: string): Promise<boolean> {
  const { params, errorCode } = getQueryParams(url);

  if (errorCode) {
    throw new Error(errorCode);
  }

  if (typeof params.code === 'string' && params.code.length > 0) {
    return exchangeCode(params.code);
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


/** True where the native Sign in with Apple sheet exists (iOS 13+). */
export async function appleSignInAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  return AppleAuthentication.isAvailableAsync().catch(() => false);
}

/**
 * Native Sign in with Apple (App Store guideline 4.8). Apple signs a hashed
 * nonce into the identity token; Supabase checks it against the raw nonce.
 * Returns false when the user cancels the sheet. Invites match on the
 * email Apple shares: a "Hide My Email" relay address will not match an
 * invite, so that user lands on the invite-required screen.
 */
export async function signInWithApple(): Promise<boolean> {
  const rawNonce = Crypto.randomUUID() + Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    rawNonce,
  );

  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });
  } catch (e) {
    if ((e as { code?: string } | null)?.code === 'ERR_REQUEST_CANCELED') {
      return false;
    }
    throw e;
  }
  if (!credential.identityToken) {
    throw new Error('Apple did not return an identity token. Try again.');
  }

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
    nonce: rawNonce,
  });
  if (error) throw error;

  // Apple sends the name only on the very first authorization, and never in
  // the identity token, so save it now: into the auth metadata (invite
  // acceptance reads full_name there) and into the profile if it is empty.
  const fullName = [credential.fullName?.givenName, credential.fullName?.familyName]
    .filter((part): part is string => !!part && part.trim().length > 0)
    .join(' ')
    .trim();
  const userId = data.user?.id;
  if (fullName && userId) {
    await supabase.auth
      .updateUser({
        data: {
          full_name: fullName,
          given_name: credential.fullName?.givenName ?? null,
          family_name: credential.fullName?.familyName ?? null,
        },
      })
      .catch(() => undefined);
    // The signup trigger creates the profile when an invite matched; claim
    // covers a profile that is still missing. Then fill an empty name only.
    await supabase.rpc('claim_pending_invite').then(
      () => undefined,
      () => undefined,
    );
    await supabase
      .from('profiles')
      .update({ full_name: fullName })
      .eq('id', userId)
      .is('full_name', null)
      .then(
        () => undefined,
        () => undefined,
      );
  }
  return true;
}
