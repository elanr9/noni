import { useEffect, useState } from 'react';
import { Alert, Platform, StyleSheet, View } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { router } from 'expo-router';

import { Button } from '../../components/ui/Button';
import {
  routeAfterSignIn,
  signInWithApple,
  signInWithGoogle,
} from '../../lib/auth-session';
import { finishOnboardingAuth } from '../../lib/onboarding';
import { space } from '../../theme/tokens';
import { OnboardingShell } from './_shell';

export default function SaveProgressScreen() {
  const [busy, setBusy] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    AppleAuthentication.isAvailableAsync()
      .then(setAppleAvailable)
      .catch(() => setAppleAvailable(false));
  }, []);

  async function afterAuth() {
    const outcome = await finishOnboardingAuth();
    if (outcome === 'existing') {
      await routeAfterSignIn();
      return;
    }
    router.push('/(onboarding)/heard');
  }

  async function handleApple() {
    setBusy(true);
    try {
      const signedIn = await signInWithApple();
      if (signedIn) await afterAuth();
    } catch (e) {
      Alert.alert(
        'Sign in failed',
        e instanceof Error ? e.message : 'Could not sign in with Apple',
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    setBusy(true);
    try {
      const signedIn = await signInWithGoogle();
      if (signedIn) await afterAuth();
    } catch (e) {
      Alert.alert(
        'Sign in failed',
        e instanceof Error ? e.message : 'Could not sign in with Google',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <OnboardingShell
      step={8}
      onBack={() => router.back()}
      title="Save your progress"
      titleSize="screen"
      centerContent
    >
      <View style={styles.authStack}>
        {appleAvailable ? (
          <Button
            size="lg"
            block
            variant="secondary"
            disabled={busy}
            onPress={() => {
              if (!busy) void handleApple();
            }}
          >
            Sign in with Apple
          </Button>
        ) : null}
        <Button
          size="lg"
          block
          variant="outline"
          disabled={busy}
          onPress={() => void handleGoogle()}
        >
          Sign in with Google
        </Button>
      </View>
    </OnboardingShell>
  );
}

const styles = StyleSheet.create({
  authStack: {
    gap: space.stackGap,
    width: '100%',
  },
});
