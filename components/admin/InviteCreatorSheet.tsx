// Invite a creator to the company by email. The invitee downloads the app
// and signs in with Google on the invited address; signup attaches them.
import { useEffect, useState, type JSX } from 'react';
import { StyleSheet, Text } from 'react-native';

import { color, type } from '../../theme/tokens';
import { Button } from '../ui/Button';
import { TextField } from '../ui/TextField';
import { Sheet } from './shared';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface InviteCreatorSheetProps {
  visible: boolean;
  sending: boolean;
  onClose: () => void;
  onInvite: (name: string, email: string) => void;
}

export function InviteCreatorSheet({
  visible,
  sending,
  onClose,
  onInvite,
}: InviteCreatorSheetProps): JSX.Element {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');

  useEffect(() => {
    if (visible) {
      setName('');
      setEmail('');
    }
  }, [visible]);

  const valid = name.trim().length > 0 && EMAIL_RE.test(email.trim());

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      footer={
        <Button
          size="md"
          variant="primary"
          block
          disabled={sending || !valid}
          onPress={() => onInvite(name.trim(), email.trim().toLowerCase())}
        >
          {sending ? 'Sending…' : 'Send invite'}
        </Button>
      }
    >
      <Text style={styles.title}>Invite a creator</Text>
      <Text style={styles.note}>
        They get an email with a link to download Noni. Once they sign in with
        Google on this address, they join your roster.
      </Text>
      <Text style={styles.label}>Name</Text>
      <TextField
        value={name}
        onChangeText={setName}
        placeholder="Sam Rivera"
        autoCapitalize="words"
        accessibilityLabel="Creator name"
      />
      <Text style={styles.label}>Email</Text>
      <TextField
        value={email}
        onChangeText={setEmail}
        placeholder="sam@example.com"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        accessibilityLabel="Creator email"
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: type.size.title,
    fontWeight: type.weight.heavy,
    color: color.ink,
  },
  note: {
    marginTop: 6,
    marginBottom: 14,
    fontSize: type.size.bodySm,
    lineHeight: type.size.bodySm * type.leading.body,
    color: color.slate500,
  },
  label: {
    marginTop: 10,
    marginBottom: 6,
    fontSize: type.size.bodySm,
    fontWeight: '700',
    color: color.ink,
  },
});
