import { useState } from 'react';
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
import { router } from 'expo-router';

import { BrandTitle, Screen, colors } from '../../components/Screen';
import { routeAfterSignIn } from '../../lib/auth-session';
import { supabase } from '../../lib/supabase';

function normalizePhone(input: string): string {
  const digits = input.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits;
  return `+1${digits}`;
}

export default function PhoneLoginScreen() {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function sendCode() {
    const normalized = normalizePhone(phone);
    if (normalized.length < 11) {
      Alert.alert('Check details', 'Enter a valid phone number.');
      return;
    }

    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        phone: normalized,
      });
      if (error) {
        Alert.alert('Could not send code', error.message);
        return;
      }
      setCodeSent(true);
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode() {
    if (code.trim().length < 6) {
      Alert.alert('Check details', 'Enter the 6 digit code from the text.');
      return;
    }

    setBusy(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        phone: normalizePhone(phone),
        token: code.trim(),
        type: 'sms',
      });
      if (error) {
        Alert.alert('Verification failed', error.message);
        return;
      }

      await routeAfterSignIn();
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
        <BrandTitle
          title="Sign in with phone"
          subtitle={
            codeSent
              ? 'Enter the code we texted you.'
              : 'We will text you a code.'
          }
        />

        <View style={styles.form}>
          {codeSent ? (
            <>
              <Text style={styles.label}>Code</Text>
              <TextInput
                autoFocus
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                placeholder="123456"
                placeholderTextColor="#9A9AA3"
                maxLength={6}
                style={styles.input}
                value={code}
                onChangeText={setCode}
                editable={!busy}
                onSubmitEditing={() => void verifyCode()}
              />
              <Pressable
                style={[styles.button, busy && styles.buttonDisabled]}
                onPress={() => void verifyCode()}
                disabled={busy}
              >
                <Text style={styles.buttonText}>
                  {busy ? 'Verifying…' : 'Verify'}
                </Text>
              </Pressable>
              <Pressable
                style={styles.linkButton}
                onPress={() => {
                  setCode('');
                  setCodeSent(false);
                }}
                disabled={busy}
              >
                <Text style={styles.linkText}>Use a different number</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.label}>Phone number</Text>
              <TextInput
                autoFocus
                keyboardType="phone-pad"
                textContentType="telephoneNumber"
                placeholder="+1 555 000 0000"
                placeholderTextColor="#9A9AA3"
                style={styles.input}
                value={phone}
                onChangeText={setPhone}
                editable={!busy}
                onSubmitEditing={() => void sendCode()}
              />
              <Pressable
                style={[styles.button, busy && styles.buttonDisabled]}
                onPress={() => void sendCode()}
                disabled={busy}
              >
                <Text style={styles.buttonText}>
                  {busy ? 'Sending…' : 'Send code'}
                </Text>
              </Pressable>
              <Pressable
                style={styles.linkButton}
                onPress={() => router.back()}
                disabled={busy}
              >
                <Text style={styles.linkText}>Back to sign in</Text>
              </Pressable>
            </>
          )}
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
  linkButton: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  linkText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.muted,
  },
});
