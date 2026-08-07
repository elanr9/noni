import { useEffect, useState } from 'react';
import { Alert, Platform, StyleSheet } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { router } from 'expo-router';

import { CalAuthButton, CalShell } from '../../components/OnboardingUI';
import {
  routeAfterSignIn,
  signInWithApple,
  signInWithGoogle,
} from '../../lib/auth-session';
import { finishOnboardingAuth } from '../../lib/onboarding';

const TOTAL = 12;

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
    <CalShell
      progress={8 / TOTAL}
      onBack={() => router.back()}
      title="Save your progress"
      subtitle="Create an account so your answers and earnings are never lost."
    >
      {appleAvailable ? (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
          cornerRadius={28}
          style={styles.appleButton}
          onPress={() => {
            if (!busy) void handleApple();
          }}
        />
      ) : null}
      <CalAuthButton
        label="Sign in with Google"
        variant="outline"
        disabled={busy}
        onPress={() => void handleGoogle()}
      />
    </CalShell>
  );
}

const styles = StyleSheet.create({
  appleButton: { height: 56 },
});
