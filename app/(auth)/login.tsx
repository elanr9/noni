import { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';

import { BrandTitle, Screen, colors } from '../../components/Screen';
import {
  routeAfterSignIn,
  signInWithApple,
  signInWithGoogle,
} from '../../lib/auth-session';
import { supabase } from '../../lib/supabase';

// TEMP: email/password restored for existing test accounts (elan@gmail.com).
export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    AppleAuthentication.isAvailableAsync()
      .then(setAppleAvailable)
      .catch(() => setAppleAvailable(false));
  }, []);

  async function signInWithPassword() {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed.includes('@') || password.length < 1) {
      Alert.alert('Check details', 'Enter email and password.');
      return;
    }

    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: trimmed,
        password,
      });
      if (error) {
        Alert.alert('Sign in failed', error.message);
        return;
      }

      await routeAfterSignIn();
    } finally {
      setBusy(false);
    }
  }

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
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <BrandTitle title="Sign in" subtitle="Email and password." />

        <View style={styles.form}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            placeholder="you@company.com"
            placeholderTextColor="#9A9AA3"
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            editable={!busy}
          />
          <Text style={styles.label}>Password</Text>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            placeholder="Password"
            placeholderTextColor="#9A9AA3"
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            editable={!busy}
            onSubmitEditing={() => void signInWithPassword()}
          />
          <Pressable
            style={[styles.button, busy && styles.buttonDisabled]}
            onPress={() => void signInWithPassword()}
            disabled={busy}
          >
            <Text style={styles.buttonText}>
              {busy ? 'Signing in…' : 'Sign in'}
            </Text>
          </Pressable>

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          {appleAvailable ? (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={
                AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
              }
              buttonStyle={
                AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
              }
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
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  form: { gap: 12 },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.ink,
  },
  input: {
    borderWidth: 1.5,
    borderColor: '#D9D6D0',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 18,
    color: colors.ink,
  },
  button: {
    marginTop: 8,
    backgroundColor: colors.ink,
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 4,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#D9D6D0',
  },
  dividerText: {
    fontSize: 14,
    color: colors.muted,
  },
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
