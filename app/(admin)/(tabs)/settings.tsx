// Settings is the manager's own account only: invites, notifications,
// support, sign out, delete. Company brain, billing and team live on the
// web admin console.
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import {
  AdminScreen,
  Card,
  ConfirmationTakeover,
  PushHeader,
  Sheet,
} from '../../../components/admin/shared';
import { Button } from '../../../components/ui/Button';
import { Icon, type IconName } from '../../../components/ui/Icon';
import { TextField } from '../../../components/ui/TextField';
import { inviteCreator } from '../../../lib/admin-api';
import { useAuth } from '../../../lib/auth';
import { contactSupport } from '../../../lib/support';
import { supabase } from '../../../lib/supabase';
import { borderWidth, color, type } from '../../../theme/tokens';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type OpenSheet = 'invite' | 'notifs' | 'terms' | 'signout' | 'delete' | null;
type Ended = 'signedout' | 'deleted' | null;

function NavRow({
  icon,
  label,
  tone = 'plain',
  last = false,
  onPress,
}: {
  icon: IconName;
  label: string;
  tone?: 'plain' | 'danger';
  last?: boolean;
  onPress?: () => void;
}) {
  const danger = tone === 'danger';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.navRow, !last && styles.navRowBorder]}
    >
      <Icon name={icon} size={19} color={danger ? color.danger : color.slate500} />
      <Text style={[styles.navLabel, danger && { color: color.danger }]}>{label}</Text>
      {!danger && <Icon name="chevron-right" size={17} color={color.slate300} />}
    </Pressable>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      hitSlop={8}
      onPress={() => onChange(!on)}
      style={[styles.toggle, { backgroundColor: on ? color.blue500 : color.lineStrong }]}
    >
      <View style={[styles.toggleKnob, on && { alignSelf: 'flex-end' }]} />
    </Pressable>
  );
}

const NOTIF_ROWS: Array<{ key: 'subs' | 'live' | 'weekly'; label: string; sub: string }> = [
  { key: 'subs', label: 'New submissions', sub: 'A creator sends something for review' },
  { key: 'live', label: 'Posts going live', sub: 'An approved post publishes' },
  { key: 'weekly', label: 'Weekly summary', sub: 'Views, sign-ups and earnings every Monday' },
];

export default function SettingsScreen() {
  const { profile, signOut } = useAuth();
  const router = useRouter();
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [open, setOpen] = useState<OpenSheet>(null);
  const [ended, setEnded] = useState<Ended>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [notifs, setNotifs] = useState({ subs: true, live: true, weekly: false });

  useFocusEffect(
    useCallback(() => {
      void supabase
        .from('companies')
        .select('name')
        .maybeSingle()
        .then(({ data }) => {
          if (data !== null) setCompanyName(data.name);
        });
    }, []),
  );

  const company = companyName ?? 'your company';
  const inviteValid = name.trim().length > 0 && EMAIL_RE.test(email.trim());

  async function sendInvite() {
    if (!profile) return;
    setSending(true);
    setInviteError(null);
    try {
      await inviteCreator(profile.company_id, name.trim(), email.trim().toLowerCase());
      setSent(true);
    } catch (e) {
      setInviteError(e instanceof Error ? e.message : 'Could not send. Try again.');
    } finally {
      setSending(false);
    }
  }

  const terms: Array<[string, string]> = [
    [
      'Your account',
      `You use Noni on behalf of ${company}. Your access can be granted or revoked by the company admin at any time.`,
    ],
    [
      'Content and approvals',
      'Approving a post publishes it to the linked creator accounts. You are responsible for reviewing content before it goes live.',
    ],
    [
      'Payments',
      'Creator earnings unlock on your approvals and are paid from the company budget. Noni does not hold funds on your behalf.',
    ],
    [
      'Data',
      'Analytics come from the connected platforms and Stripe. Noni stores only what it needs to run briefs, approvals and payouts.',
    ],
    [
      'Leaving',
      'Deleting your account removes your access and preferences. Posts, creators and company data stay with the company.',
    ],
  ];

  return (
    <>
      <AdminScreen>
        <PushHeader title="Settings" onBack={() => router.back()} />

        <View style={styles.stack}>
        <Card pad={0}>
          <NavRow
            icon="plus"
            label="Invite a creator"
            onPress={() => {
              setName('');
              setEmail('');
              setSent(false);
              setInviteError(null);
              setOpen('invite');
            }}
          />
          <NavRow icon="bell" label="Notifications" onPress={() => setOpen('notifs')} />
          <NavRow
            icon="message-circle"
            label="Contact support"
            onPress={() => contactSupport('Noni admin support')}
          />
          <NavRow
            icon="link"
            label="Terms and conditions"
            last
            onPress={() => setOpen('terms')}
          />
        </Card>

        <Card pad={0}>
          <NavRow
            icon="log-out"
            label="Sign out"
            tone="danger"
            onPress={() => setOpen('signout')}
          />
          <NavRow
            icon="trash-2"
            label="Delete account"
            tone="danger"
            last
            onPress={() => setOpen('delete')}
          />
        </Card>

        <Text style={styles.foot}>
          {`Signed in as campaign manager · ${company}`}
        </Text>
        </View>
      </AdminScreen>

      <Sheet
        visible={open === 'invite'}
        onClose={() => setOpen(null)}
        title={sent ? 'Invite sent' : 'Invite a creator'}
        subtitle={
          sent
            ? undefined
            : `They get an email that signs them into the creator app for ${company}. No setup on their end.`
        }
        footer={
          sent ? (
            <Button variant="primary" size="lg" block onPress={() => setOpen(null)}>
              Done
            </Button>
          ) : (
            <Button
              variant="primary"
              size="lg"
              block
              disabled={sending || !inviteValid}
              onPress={() => void sendInvite()}
            >
              {sending ? 'Sending' : 'Send invite'}
            </Button>
          )
        }
      >
        {sent ? (
          <View style={styles.sentRow}>
            <Icon name="circle-check-big" size={20} color={color.green} />
            <Text style={styles.sentText}>
              {`${name.trim()} is invited. That email is already bound to ${company}, so signing in lands them in the creator app with nothing to configure.`}
            </Text>
          </View>
        ) : (
          <View>
            <TextField
              value={name}
              onChangeText={setName}
              placeholder="Name"
              autoCapitalize="words"
              accessibilityLabel="Creator name"
            />
            <TextField
              value={email}
              onChangeText={setEmail}
              placeholder="Email"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              accessibilityLabel="Creator email"
              style={styles.fieldGap}
            />
            {inviteError !== null && <Text style={styles.inviteError}>{inviteError}</Text>}
          </View>
        )}
      </Sheet>

      <Sheet
        visible={open === 'notifs'}
        onClose={() => setOpen(null)}
        title="Notifications"
        subtitle="What Noni pings you about."
        footer={
          <Button variant="primary" size="lg" block onPress={() => setOpen(null)}>
            Done
          </Button>
        }
      >
        <View>
          {NOTIF_ROWS.map((row, i) => (
            <View
              key={row.key}
              style={[styles.notifRow, i < NOTIF_ROWS.length - 1 && styles.notifRowBorder]}
            >
              <View style={styles.notifText}>
                <Text style={styles.notifLabel}>{row.label}</Text>
                <Text style={styles.notifSub}>{row.sub}</Text>
              </View>
              <Toggle
                on={notifs[row.key]}
                onChange={(v) => setNotifs({ ...notifs, [row.key]: v })}
              />
            </View>
          ))}
        </View>
      </Sheet>

      <Sheet
        visible={open === 'terms'}
        onClose={() => setOpen(null)}
        title="Terms and conditions"
        subtitle="The short version. The full text lives on usenoni.app/terms."
        footer={
          <Button variant="primary" size="lg" block onPress={() => setOpen(null)}>
            Done
          </Button>
        }
      >
        <View style={styles.termsList}>
          {terms.map(([h, b]) => (
            <View key={h}>
              <Text style={styles.termsHead}>{h.toUpperCase()}</Text>
              <Text style={styles.termsBody}>{b}</Text>
            </View>
          ))}
        </View>
      </Sheet>

      <Sheet
        visible={open === 'signout'}
        onClose={() => setOpen(null)}
        title="Sign out?"
        subtitle="Are you sure? You can sign back in anytime with the same email."
        footer={
          <View style={styles.footerStack}>
            <Button
              variant="danger"
              size="lg"
              block
              onPress={() => {
                setOpen(null);
                setEnded('signedout');
              }}
            >
              Sign out
            </Button>
            <Button variant="ghost" size="lg" block onPress={() => setOpen(null)}>
              Stay signed in
            </Button>
          </View>
        }
      >
        <Text style={styles.sheetBody}>
          {`Pending approvals stay in the queue for ${company}. Nothing is lost.`}
        </Text>
      </Sheet>

      <Sheet
        visible={open === 'delete'}
        onClose={() => setOpen(null)}
        title="Delete your account?"
        subtitle="Are you sure? This removes you as a campaign manager. Posts, creators and company data stay with the company."
        footer={
          <View style={styles.footerStack}>
            <Button
              variant="danger"
              size="lg"
              block
              onPress={() => {
                setOpen(null);
                setEnded('deleted');
              }}
            >
              Delete account
            </Button>
            <Button variant="ghost" size="lg" block onPress={() => setOpen(null)}>
              Keep my account
            </Button>
          </View>
        }
      >
        <Text style={styles.sheetBody}>
          Your admin can invite you again later, but your notification preferences
          and sign-in are gone for good.
        </Text>
      </Sheet>

      {ended === 'signedout' && (
        <ConfirmationTakeover
          icon="log-out"
          tone="brand"
          title="Signed out"
          body="Sign back in anytime with the same email."
          actionLabel="Sign back in"
          onAction={() => void signOut()}
        />
      )}
      {ended === 'deleted' && (
        <ConfirmationTakeover
          icon="trash-2"
          tone="danger"
          title="Account deleted"
          body={`You no longer have access to ${company} on Noni.`}
          actionLabel="Back"
          onAction={() => void signOut()}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: 14,
    paddingTop: 4,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 44,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  navRowBorder: {
    borderBottomWidth: borderWidth.hair,
    borderBottomColor: color.line,
  },
  navLabel: {
    flex: 1,
    fontSize: type.size.bodySm,
    fontWeight: '600',
    color: color.ink,
  },
  foot: {
    marginHorizontal: 2,
    textAlign: 'center',
    fontSize: type.size.label,
    fontWeight: '600',
    color: color.slate300,
  },
  sentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 11,
    paddingVertical: 4,
  },
  sentText: {
    flex: 1,
    fontSize: type.size.bodySm,
    lineHeight: type.size.bodySm * 1.5,
    color: color.ink,
  },
  fieldGap: {
    marginTop: 10,
  },
  inviteError: {
    marginTop: 10,
    fontSize: type.size.chip,
    fontWeight: '600',
    color: color.danger,
  },
  notifRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
  },
  notifRowBorder: {
    borderBottomWidth: borderWidth.hair,
    borderBottomColor: color.line,
  },
  notifText: {
    flex: 1,
    minWidth: 0,
  },
  notifLabel: {
    fontSize: type.size.bodySm,
    fontWeight: '600',
    color: color.ink,
  },
  notifSub: {
    marginTop: 2,
    fontSize: type.size.chip,
    lineHeight: type.size.chip * 1.4,
    color: color.slate400,
  },
  toggle: {
    width: 46,
    height: 28,
    borderRadius: 999,
    padding: 2,
    justifyContent: 'center',
  },
  toggleKnob: {
    width: 24,
    height: 24,
    borderRadius: 999,
    backgroundColor: color.white,
    alignSelf: 'flex-start',
  },
  termsList: {
    gap: 14,
    paddingBottom: 4,
  },
  termsHead: {
    fontSize: type.size.label,
    fontWeight: '700',
    letterSpacing: type.tracking.label,
    color: color.slate500,
  },
  termsBody: {
    marginTop: 5,
    fontSize: type.size.meta,
    lineHeight: type.size.meta * 1.5,
    color: color.ink,
  },
  footerStack: {
    gap: 8,
  },
  sheetBody: {
    fontSize: type.size.meta,
    lineHeight: type.size.meta * 1.5,
    color: color.slate500,
  },
});
