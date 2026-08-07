import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { cal, CalShell } from '../../components/OnboardingUI';
import { useAuth } from '../../lib/auth';
import { registerPushToken } from '../../lib/notifications';

const TOTAL = 12;

export default function NotificationsScreen() {
  const { session } = useAuth();
  const [busy, setBusy] = useState(false);

  // registerPushToken asks for permission and stores the Expo push token on
  // the profile. It never throws and no-ops on simulators.
  async function allow() {
    setBusy(true);
    if (session) await registerPushToken(session.user.id);
    setBusy(false);
    router.push('/(onboarding)/permissions');
  }

  return (
    <CalShell
      progress={10 / TOTAL}
      onBack={() => router.back()}
      title="Turn on notifications"
      subtitle="We ping you when a post is ready to record and when you get paid."
      primaryLabel={busy ? 'One moment' : 'Allow notifications'}
      primaryDisabled={busy}
      onPrimary={() => void allow()}
      footer={
        <Pressable
          style={styles.skip}
          onPress={() => router.push('/(onboarding)/permissions')}
          disabled={busy}
        >
          <Text style={styles.skipText}>Not now</Text>
        </Pressable>
      }
    >
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Never miss a payout</Text>
        <Text style={styles.cardBody}>
          Posts have deadlines and payouts land on a schedule. Notifications
          keep both on your radar without you checking the app.
        </Text>
      </View>
    </CalShell>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: cal.field,
    borderRadius: 16,
    padding: 20,
    gap: 6,
    marginTop: 8,
  },
  cardTitle: { fontSize: 17, fontWeight: '700', color: cal.ink },
  cardBody: { fontSize: 15, lineHeight: 22, color: cal.sub },
  skip: { alignItems: 'center', paddingVertical: 4 },
  skipText: { fontSize: 16, fontWeight: '600', color: cal.sub },
});
