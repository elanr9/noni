import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { Screen } from '../../components/layout/Screen';
import { Button } from '../../components/ui/Button';
import { Wordmark } from '../../components/ui/Wordmark';
import { useAuth } from '../../lib/auth';
import { color, space, type } from '../../theme/tokens';

/**
 * A session exists but the signup trigger found no invite for the email, so
 * no profile was created. Noni is invite only; the user signs out and retries
 * with the Google account their invite was sent to.
 */
export default function InviteRequiredScreen() {
  const { session, signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  const email = session?.user?.email ?? 'this account';

  async function handleSwitch() {
    setBusy(true);
    try {
      await signOut();
    } finally {
      setBusy(false);
      router.replace('/(auth)/login');
    }
  }

  return (
    <Screen edges={['top', 'left', 'right', 'bottom']} contentStyle={styles.content}>
      <View style={styles.hero}>
        <Wordmark size={type.size.titleXl} />
        <Text style={styles.headline}>You need an invite</Text>
        <Text style={styles.body}>
          There is no Noni invite for {email}. Ask your company admin to send
          one, then sign in with the Google account it was sent to.
        </Text>
      </View>

      <View style={styles.footer}>
        <Button
          size="lg"
          block
          disabled={busy}
          onPress={() => void handleSwitch()}
        >
          Use a different account
        </Button>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    justifyContent: 'space-between',
  },
  hero: {
    flex: 1,
    justifyContent: 'center',
    gap: space[4],
  },
  headline: {
    fontSize: type.size.hero,
    lineHeight: type.size.hero * type.leading.tight,
    letterSpacing: type.tracking.hero,
    fontWeight: type.weight.heavy,
    color: color.ink,
  },
  body: {
    fontSize: type.size.body,
    lineHeight: type.size.body * type.leading.body,
    color: color.slate500,
    maxWidth: 300,
  },
  footer: {
    paddingBottom: space[4],
  },
});
