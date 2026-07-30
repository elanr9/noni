import { Redirect } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BrandTitle, Screen, colors } from '../../components/Screen';
import { useAuth } from '../../lib/auth';

export default function OnboardingIndex() {
  const { session, profile, signOut, refreshProfile } = useAuth();

  if (profile) {
    return profile.role === 'admin' ? (
      <Redirect href="/(onboarding)/company" />
    ) : (
      <Redirect href="/(onboarding)/creator" />
    );
  }

  return (
    <Screen>
      <BrandTitle
        title="Almost in"
        subtitle="You are signed in but not attached to a team yet. Ask your admin for an invite."
      />

      <View style={styles.card}>
        <Text style={styles.rowLabel}>Email</Text>
        <Text style={styles.rowValue}>{session?.user.email ?? '—'}</Text>
      </View>

      <Pressable style={styles.secondary} onPress={() => void refreshProfile()}>
        <Text style={styles.secondaryText}>Check again</Text>
      </Pressable>
      <Pressable style={styles.ghost} onPress={() => void signOut()}>
        <Text style={styles.ghostText}>Sign out</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 6,
    padding: 20,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E6E2DA',
    marginBottom: 20,
  },
  rowLabel: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  rowValue: {
    fontSize: 17,
    color: colors.ink,
  },
  secondary: {
    backgroundColor: colors.ink,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  secondaryText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  ghost: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  ghostText: {
    color: colors.muted,
    fontSize: 16,
    fontWeight: '600',
  },
});
