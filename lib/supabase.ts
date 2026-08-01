import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { fetch as expoFetch } from 'expo/fetch';

import type { Database } from './types';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY',
  );
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  global: {
    // Expo Go / RN fetch can reject HTTPS with "Network request failed";
    // expo/fetch uses a WinterCG-compliant stack that works on device.
    fetch: expoFetch as typeof fetch,
  },
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
