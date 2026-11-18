// Creator Settings sheets: edit name, sign out, delete account.
import { useEffect, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { SoleAdminError, checkCanDeleteAccount, deleteMyAccount } from '../../../../lib/account-api';
import { color, radius, space, text } from '../../../../theme/v2';
import { ActionButton, SheetBody } from '../../../admin/v2/settings/SettingsParts';
import { Field, Sheet, TextButton } from '../../../v2';
import { toast } from '../../../v2/Toast';

function errorText(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback;
}

export function NameSheet({ open, onClose, current, save }: { open: boolean; onClose: () => void; current: string; save: (name: string) => Promise<void> }) {
  const [name, setName] = useState(current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName(current);
      setError(null);
    }
  }
  const trimmed = name.trim();
  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      await save(trimmed);
      toast.success('Name saved');
      onClose();
    } catch (e) {
      setError(errorText(e, 'Could not save your name. Try again.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet
      open={open}
      onClose={busy ? () => undefined : onClose}
      title="Your name"
      footer={
        <>
          <ActionButton tone="quiet" label="Cancel" disabled={busy} onPress={onClose} />
          <ActionButton tone="primary" label="Save" busyLabel="Saving" busy={busy} disabled={!trimmed || trimmed === current.trim()} onPress={() => void run()} />
        </>
      }
    >
      <Field
        value={name}
        onChange={setName}
        placeholder="First and last name"
        autoFocus
        autoCapitalize="words"
        autoComplete="name"
        textContentType="name"
        returnKeyType="done"
        editable={!busy}
        onSubmitEditing={() => (trimmed && !busy ? void run() : undefined)}
      />
      <SheetBody>Your campaign managers see this name on your posts and messages.</SheetBody>
      {error ? (
        <Animated.View entering={FadeIn.duration(180)} style={{ marginTop: space[2] }}>
          <SheetBody tone="error">{error}</SheetBody>
        </Animated.View>
      ) : null}
    </Sheet>
  );
}

export function SignOutSheet({ open, onClose, company, signOut }: { open: boolean; onClose: () => void; company: string; signOut: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      await signOut();
    } catch (e) {
      setBusy(false);
      toast.error(errorText(e, 'Could not sign out. Try again.'));
    }
  };
  return (
    <Sheet
      open={open}
      onClose={busy ? () => undefined : onClose}
      title="Sign out?"
      footer={
        <>
          <ActionButton tone="quiet" label="Stay" disabled={busy} onPress={onClose} />
          <ActionButton label="Sign out" busyLabel="Signing out" busy={busy} onPress={() => void run()} />
        </>
      }
    >
      <SheetBody>{`Your posts and earnings stay with ${company}. Sign back in anytime with the same email.`}</SheetBody>
    </Sheet>
  );
}

type DeleteState = { kind: 'checking' } | { kind: 'ready' } | { kind: 'blocked'; companies: string[] } | { kind: 'error'; message: string };

export function DeleteSheet({ open, onClose, signOut }: { open: boolean; onClose: () => void; signOut: () => Promise<void> }) {
  const [state, setState] = useState<DeleteState>({ kind: 'checking' });
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // Every open (and every Check again) starts from a fresh check and an empty field.
  const [seen, setSeen] = useState({ open, attempt });
  if (seen.open !== open || seen.attempt !== attempt) {
    setSeen({ open, attempt });
    if (open) {
      setState({ kind: 'checking' });
      setConfirm('');
    }
  }

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    checkCanDeleteAccount()
      .then(() => {
        if (!cancelled) setState({ kind: 'ready' });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setState(e instanceof SoleAdminError ? { kind: 'blocked', companies: e.companies } : { kind: 'error', message: errorText(e, 'Could not check your account. Try again.') });
      });
    return () => {
      cancelled = true;
    };
  }, [open, attempt]);

  const confirmed = confirm.trim().toUpperCase() === 'DELETE';

  const run = async () => {
    setBusy(true);
    try {
      await deleteMyAccount();
      toast.success('Your account is deleted.');
      await signOut().catch(() => undefined);
    } catch (e) {
      setBusy(false);
      if (e instanceof SoleAdminError) {
        setState({ kind: 'blocked', companies: e.companies });
        return;
      }
      setState({ kind: 'error', message: errorText(e, 'Could not delete your account. Try again.') });
    }
  };

  return (
    <Sheet
      open={open}
      onClose={busy ? () => undefined : onClose}
      title={state.kind === 'blocked' ? 'Hand over your company first' : 'Delete your account?'}
      footer={
        state.kind === 'blocked' ? (
          <ActionButton tone="quiet" label="Close" onPress={onClose} />
        ) : (
          <>
            <ActionButton tone="quiet" label="Keep it" disabled={busy} onPress={onClose} />
            <ActionButton label="Delete" busyLabel="Deleting" busy={busy} disabled={state.kind !== 'ready' || !confirmed} onPress={() => void run()} />
          </>
        )
      }
    >
      {state.kind === 'blocked' ? (
        <Animated.View entering={FadeIn.duration(200)}>
          <SheetBody>{`You are the only admin of ${state.companies.join(', ')}, and other people still work there. Make another member an admin on the web console, then delete your account here.`}</SheetBody>
        </Animated.View>
      ) : (
        <View>
          <SheetBody>
            This permanently deletes your sign-in, profile, photo and notification settings. Posts you made stay with the companies you made them for. Payouts already sent are not affected. This cannot be undone.
          </SheetBody>
          <Text style={[text.meta, { marginTop: space[4], marginBottom: 6 }]}>Type DELETE to confirm</Text>
          <TextInput
            value={confirm}
            onChangeText={setConfirm}
            editable={!busy && state.kind === 'ready'}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder="DELETE"
            placeholderTextColor={color.grey3}
            accessibilityLabel="Type DELETE to confirm"
            style={{ height: 48, borderRadius: radius.option, backgroundColor: color.grey1, paddingHorizontal: 14, fontSize: 16, fontWeight: '600', color: color.ink }}
          />
          {state.kind === 'checking' ? (
            <Text style={[text.meta, { marginTop: 8 }]}>Checking your account</Text>
          ) : state.kind === 'error' ? (
            <Animated.View entering={FadeIn.duration(180)} style={{ marginTop: 8, gap: 8 }}>
              <SheetBody tone="error">{state.message}</SheetBody>
              <View style={{ alignSelf: 'flex-start', marginLeft: -12 }}>
                <TextButton label="Check again" onPress={() => setAttempt((n) => n + 1)} />
              </View>
            </Animated.View>
          ) : null}
        </View>
      )}
    </Sheet>
  );
}
