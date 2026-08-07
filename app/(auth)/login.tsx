import { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';

import { BrandTitle, Screen, colors } from '../../components/Screen';
import {
  routeAfterSignIn,
  signInWithApple,
  signInWithGoogle,
} from '../../lib/auth-session';

export default function LoginScreen() {
  const [busy, setBusy] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    AppleAuthentication.isAvailableAsync()
      .then(setAppleAvailable)
      .catch(() => setAppleAvailable(false));
  }, []);

  async function handleGoogle() {
    setBusy(true);
    try {
      const signedIn = await signInWithGoogle();
      if (signedIn) await routeAfterSignIn();
    } catch (e) {
      Alert.alert(
        'Sign in failed',
        e instanceof Error ? e.message : 'Could not sign in with Google',
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleApple() {
    setBusy(true);
    try {
      const signedIn = await signInWithApple();
      if (signedIn) await routeAfterSignIn();
    } catch (e) {
      Alert.alert(
        'Sign in failed',
        e instanceof Error ? e.message : 'Could not sign in with Apple',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <BrandTitle title="Sign in" subtitle="Pick up where you left off." />

      <View style={styles.form}>
        {appleAvailable ? (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
            cornerRadius={16}
            style={styles.appleButton}
            onPress={() => {
              if (!busy) void handleApple();
            }}
          />
        ) : null}

        <Pressable
          style={[styles.altButton, busy && styles.buttonDisabled]}
          onPress={() => void handleGoogle()}
          disabled={busy}
        >
          <Text style={styles.altButtonText}>Sign in with Google</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: 12, marginTop: 24 },
  buttonDisabled: { opacity: 0.5 },
  appleButton: {
    height: 56,
  },
  altButton: {
    borderWidth: 1.5,
    borderColor: '#D9D6D0',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 17,
    alignItems: 'center',
  },
  altButtonText: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: '700',
  },
});
