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
 * no profile was created. Noni is invite only and invites match by email; the
 * user signs out and retries with the account their invite was sent to.
 * Sign in with Apple's "Hide My Email" gives a private relay address that can
 * never match an invite, so that case gets its own explanation.
 */
export default function InviteRequiredScreen() {
  const { session, signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  const email = session?.user?.email ?? 'this account';
  const provider = session?.user?.app_metadata?.provider;
  const hiddenAppleEmail = /@privaterelay\.appleid\.com$/i.test(email);

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
        {hiddenAppleEmail ? (
          <Text style={styles.body}>
            You signed in with Apple and chose Hide My Email, so Noni received a
            private relay address instead of the email your invite was sent to.
            Sign in with Google using that email instead, or ask your company
            admin to re-invite you at {email}. To share your real email with
            Apple, remove Noni under Settings, Apple Account, Sign in with
            Apple, then sign in again and choose Share My Email.
          </Text>
        ) : (
          <Text style={styles.body}>
            There is no Noni invite for {email}. Sign in with the account
            (Google or Apple) that uses the email address your invite was sent
            to, or ask your company admin to invite {email}.
            {provider === 'apple'
              ? ' If you used Apple, check that it shared the same email your invite went to.'
              : ''}
          </Text>
        )}
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
