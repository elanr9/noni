import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { fetch as expoFetch } from 'expo/fetch';
import { Platform } from 'react-native';

import type { Database } from './types';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// EXPO_PUBLIC_ values are inlined at bundle time, so a release build made
// without them cannot recover at runtime. Throwing here would run before the
// first frame and kill the app with no message, so the missing names are
// reported instead and the root layout renders them.
export const missingSupabaseEnv = [
  supabaseUrl ? null : 'EXPO_PUBLIC_SUPABASE_URL',
  supabaseAnonKey ? null : 'EXPO_PUBLIC_SUPABASE_ANON_KEY',
].filter((name): name is string => name !== null);

export const supabase = createClient<Database>(
  supabaseUrl ?? 'https://unconfigured.supabase.co',
  supabaseAnonKey ?? 'unconfigured',
  {
    global: {
      // Expo Go / RN fetch can reject HTTPS with "Network request failed";
      // expo/fetch uses a WinterCG-compliant stack that works on device.
      // On web (verification builds only) expo/fetch is unavailable — use the browser's.
      fetch: (Platform.OS === 'web'
        ? fetch.bind(globalThis)
        : expoFetch) as typeof fetch,
    },
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      // signInWithGoogle exchanges a PKCE code via exchangeCodeForSession.
      // Without this, supabase-js defaults to the implicit flow and GoTrue
      // returns tokens in the URL fragment, so the web callback page never
      // sees a ?code param and fails with "Missing auth code."
      flowType: 'pkce',
    },
  },
);
