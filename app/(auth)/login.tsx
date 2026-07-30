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
import { destinationForProfile } from '../../lib/profile';
import { supabase } from '../../lib/supabase';
import type { Profile } from '../../lib/profile';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function signInWithPassword() {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed.includes('@') || password.length < 1) {
      Alert.alert('Check details', 'Enter email and password.');
      return;
    }

    setBusy(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: trimmed,
        password,
      });
      if (error) {
        Alert.alert('Sign in failed', error.message);
        return;
      }

      let profile: Profile | null = null;
      if (data.user) {
        const { data: row } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', data.user.id)
          .maybeSingle();
        profile = row;
      }

      router.replace(destinationForProfile(profile, true));
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
          title="Sign in"
          subtitle="Email and password."
        />

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
});
