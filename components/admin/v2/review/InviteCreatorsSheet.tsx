// Invite a creator by email from Review, Creators or Analytics. The invitee
// downloads Noni and signs in with Google on that address to join the roster.
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text } from 'react-native';

import { inviteCreator } from '../../../../lib/admin-api';
import { color, text } from '../../../../theme/v2';
import { Button, Field, Sheet } from '../../../v2';
import { toast } from '../../../v2/Toast';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface InviteCreatorsSheetProps {
  open: boolean;
  companyId: string | undefined;
  onClose: () => void;
  /** After a successful invite. */
  onSent?: (email: string) => void;
}

export function InviteCreatorsSheet({ open, companyId, onClose, onSent }: InviteCreatorsSheetProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (open) {
      setName('');
      setEmail('');
    }
  }, [open]);

  const valid = name.trim().length > 0 && EMAIL_RE.test(email.trim());

  const send = async () => {
    if (!companyId || !valid || sending) return;
    const to = email.trim().toLowerCase();
    setSending(true);
    try {
      await inviteCreator(companyId, name.trim(), to);
      toast.success(`Invite sent to ${to}`);
      onSent?.(to);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not send the invite. Try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Invite a creator"
      footer={
        <Button
          label={sending ? 'Sending' : 'Send invite'}
          icon={sending ? undefined : 'send'}
          disabled={!valid || sending || !companyId}
          onPress={() => void send()}
        />
      }
    >
      <Text style={[text.body, { color: color.grey4, marginBottom: 16 }]}>
        They get an email with a link to download Noni. Once they sign in with Google on this address, they join your roster and you approve their accounts here in Review.
      </Text>
      <Field label="Name" value={name} onChange={setName} placeholder="Their full name" autoCapitalize="words" returnKeyType="next" />
      <Field
        label="Email"
        value={email}
        onChange={setEmail}
        placeholder="name@example.com"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        returnKeyType="send"
        onSubmitEditing={() => void send()}
        right={sending ? <ActivityIndicator size="small" color={color.blue} /> : undefined}
      />
    </Sheet>
  );
}
