import * as QueryParams from 'expo-auth-session/build/QueryParams';
import * as Linking from 'expo-linking';
import { makeRedirectUri } from 'expo-auth-session';

import { supabase } from './supabase';

export function getAuthRedirectUri(): string {
  return makeRedirectUri({
    scheme: 'noni',
    path: 'auth/callback',
  });
}

export async function createSessionFromUrl(url: string): Promise<boolean> {
  const { params, errorCode } = QueryParams.getQueryParams(url);

  if (errorCode) {
    throw new Error(errorCode);
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
