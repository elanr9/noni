import { useEffect, useState } from 'react';
import { Redirect, useLocalSearchParams } from 'expo-router';
import * as Linking from 'expo-linking';
import { Platform, Text, StyleSheet } from 'react-native';

import { LoadingScreen, Screen, colors } from '../../components/Screen';
import { useAuth } from '../../lib/auth';
import { createSessionFromUrl } from '../../lib/auth-session';
import { destinationForProfile } from '../../lib/profile';

export default function AuthCallbackScreen() {
  const { session, profile, loading, activeMode } = useAuth();
  const params = useLocalSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [handled, setHandled] = useState(false);

  useEffect(() => {
    async function run() {
      try {
        // On web, prefer the real browser URL so ?code= / hash tokens survive
        // the OAuth redirect. Linking.createURL can drop or reshape them.
        const url =
          Platform.OS === 'web' && typeof window !== 'undefined'
            ? window.location.href
            : Linking.createURL('auth/callback', {
                queryParams: Object.fromEntries(
                  Object.entries(params).map(([k, v]) => [
                    k,
                    Array.isArray(v) ? v[0] : String(v ?? ''),
                  ]),
                ),
              });
        await createSessionFromUrl(url);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not finish sign in');
      } finally {
        setHandled(true);
      }
    }

    void run();
  }, [params]);

  if (error) {
    return (
      <Screen style={styles.center}>
        <Text style={styles.title}>Sign in failed</Text>
        <Text style={styles.body}>{error}</Text>
      </Screen>
    );
  }

  if (!handled || loading) {
    return <LoadingScreen label="Finishing sign in" />;
  }

  if (session) {
    return <Redirect href={destinationForProfile(profile, true, activeMode)} />;
  }

  return <Redirect href="/(auth)/login" />;
}

const styles = StyleSheet.create({
  center: {
    justifyContent: 'center',
    gap: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.ink,
  },
  body: {
    fontSize: 16,
    color: colors.muted,
  },
});
