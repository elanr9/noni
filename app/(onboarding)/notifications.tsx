import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { Button } from '../../components/ui/Button';
import { useAuth } from '../../lib/auth';
import { registerPushToken } from '../../lib/notifications';
import { borderWidth, color, radius, space, type } from '../../theme/tokens';
import { OnboardingShell } from './_shell';

export default function NotificationsScreen() {
  const { session } = useAuth();
  const [busy, setBusy] = useState(false);

  async function allow() {
    setBusy(true);
    if (session) await registerPushToken(session.user.id);
    setBusy(false);
    router.push('/(onboarding)/permissions');
  }

  return (
    <OnboardingShell
      step={1}
      total={3}
      title="Turn on notifications"
      subtitle="We ping you when a post is ready to record."
      primaryLabel={busy ? 'One moment' : 'Allow notifications'}
      primaryDisabled={busy}
      onPrimary={() => void allow()}
      footerExtra={
        <Button
          size="md"
          variant="ghost"
          block
          disabled={busy}
          onPress={() => router.push('/(onboarding)/permissions')}
        >
          Not now
        </Button>
      }
    >
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Never miss a post</Text>
        <Text style={styles.cardBody}>
          Posts have deadlines. Notifications keep them on your radar without
          you checking the app.
        </Text>
      </View>
    </OnboardingShell>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: color.fillQuiet,
    borderRadius: radius.md,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
    padding: space[7],
    gap: space[2],
    marginTop: space[2],
  },
  cardTitle: {
    fontSize: type.size.action,
    fontWeight: type.weight.bold,
    color: color.ink,
  },
  cardBody: {
    fontSize: type.size.bodySm,
    lineHeight: type.size.bodySm * type.leading.body,
    color: color.slate500,
  },
});
