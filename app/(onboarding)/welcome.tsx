import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { cal } from '../../components/OnboardingUI';

export default function WelcomeScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.hero}>
        <Text style={styles.wordmark}>Noni</Text>
        <Text style={styles.headline}>Get paid to post.</Text>
        <Text style={styles.subline}>We handle everything else.</Text>
      </View>

      <View style={styles.footer}>
        <Pressable
          style={styles.primary}
          onPress={() => router.push('/(onboarding)/name')}
        >
          <Text style={styles.primaryText}>Get Started</Text>
        </Pressable>
        <Pressable
          style={styles.signInRow}
          onPress={() => router.push('/(auth)/login')}
        >
          <Text style={styles.signInMuted}>Already have an account? </Text>
          <Text style={styles.signInLink}>Sign in</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: cal.bg },
  hero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 8,
  },
  wordmark: {
    fontSize: 56,
    fontWeight: '800',
    color: cal.ink,
    letterSpacing: -1.5,
    marginBottom: 20,
  },
  headline: {
    fontSize: 28,
    fontWeight: '700',
    color: cal.ink,
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  subline: {
    fontSize: 18,
    color: cal.sub,
    textAlign: 'center',
  },
  footer: { paddingHorizontal: 24, paddingBottom: 12, gap: 16 },
  primary: {
    backgroundColor: cal.ink,
    borderRadius: 999,
    paddingVertical: 18,
    alignItems: 'center',
  },
  primaryText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  signInRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  signInMuted: { fontSize: 16, color: cal.sub },
  signInLink: { fontSize: 16, fontWeight: '700', color: cal.ink },
});
