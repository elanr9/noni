// Settings: the manager's account and the active company's team. Pushed from
// the Analytics gear (or a billing push); back returns to where it opened.
// Brand Brain, features, team permissions and billing live on the web console.
import { useCallback, useEffect, useState } from 'react';
import { Linking, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import Animated, { FadeIn, FadeInDown, LinearTransition } from 'react-native-reanimated';

import {
  ActionButton,
  CircleButton,
  SettingsCard,
  SettingsLabel,
  SettingsRow,
  SheetBody,
} from '../../components/admin/v2/settings/SettingsParts';
import { CompanyMark } from '../../components/shared/CompanyMark';
import { OutlinedText } from '../../components/ui/OutlinedText';
import { Avatar, Button, Field, Icon, Press, Screen, Sheet, Skeleton, TextButton, Toggle } from '../../components/v2';
import { toast } from '../../components/v2/Toast';
import {
  SoleAdminError,
  checkCanDeleteAccount,
  deleteMyAccount,
  getNotificationPrefs,
  prefOn,
  setNotificationPref,
  type NotificationCategory,
  type NotificationPrefs,
} from '../../lib/account-api';
import { inviteCreator } from '../../lib/admin-api';
import {
  TERMS_URL,
  TEXT_THEME_SWATCHES,
  WEB_CONSOLE_URL,
  fetchCompanySettings,
  inviteManager,
  listPendingManagerInvites,
  listTeam,
  type CompanySettingsSummary,
  type InvitedManager,
  type TeamMember,
} from '../../lib/admin-settings-api';
import { useAuth } from '../../lib/auth';
import { saveOverlayThemeColor } from '../../lib/briefs-api';
import { useCompany } from '../../lib/company-context';
import { sideLabel, sideForRole } from '../../lib/companies-api';
import {
  CLASSIC_TEXT_COLOR,
  OVERLAY_TEXT_SPEC,
  overlayBoxFill,
  overlayTextContrast,
} from '../../lib/overlay-boxes';
import { contactSupport } from '../../lib/support';
import { color, radius, shadow, space, text } from '../../theme/v2';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HEX_RE = /^#?[0-9a-fA-F]{6}$/;

type OpenSheet = 'inviteManager' | 'inviteCreator' | 'theme' | 'terms' | 'signout' | 'delete' | null;

const NOTIF_ROWS: Array<{ key: NotificationCategory; label: string; sub: string; icon: 'inbox' | 'mark_chat_unread' | 'trending_up' }> = [
  { key: 'submissions', label: 'Waiting for review', sub: 'A creator sends a post, song or account', icon: 'inbox' },
  { key: 'messages', label: 'Messages', sub: 'Creators and your team write to you', icon: 'mark_chat_unread' },
  { key: 'live', label: 'Posts going live', sub: 'A creator posts an approved video', icon: 'trending_up' },
];

type DeleteState =
  | { kind: 'checking' }
  | { kind: 'ready' }
  | { kind: 'blocked'; companies: string[] }
  | { kind: 'error'; message: string };

/** Shimmer block inside a white card: grey fill, no card shadow or margin. */
const skel = { backgroundColor: color.grey1, marginBottom: 0, boxShadow: 'none' } as const;

function roleLabel(role: TeamMember['role']): string {
  return role === 'company_admin' ? 'Admin' : 'Manager';
}

function errorText(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback;
}

export default function SettingsScreen() {
  const router = useRouter();
  const { profile, session, permissions, managerAccess, refreshManagerAccess, signOut } = useAuth();
  const { active, summaryRows, openSwitcher } = useCompany();
  const companyId = profile?.active_company_id;

  const [summary, setSummary] = useState<CompanySettingsSummary | null>(null);
  const [team, setTeam] = useState<TeamMember[] | null>(null);
  const [pending, setPending] = useState<InvitedManager[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [open, setOpen] = useState<OpenSheet>(null);

  const load = useCallback(async () => {
    if (!companyId || !profile) return;
    setLoadError(false);
    void refreshManagerAccess();
    try {
      const [s, t, p, inv] = await Promise.all([
        fetchCompanySettings(companyId),
        listTeam(companyId),
        getNotificationPrefs(profile.id).catch(() => ({}) as NotificationPrefs),
        listPendingManagerInvites(companyId),
      ]);
      setSummary(s);
      setTeam(t);
      setPrefs(p);
      setPending(inv);
    } catch {
      setLoadError(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, profile?.id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const company = summary?.name ?? active?.name ?? 'your company';
  const canSwitch = summaryRows.length > 1;
  const canInviteManagers = permissions.invite_members;

  const togglePref = async (key: NotificationCategory, on: boolean) => {
    const before = prefs ?? {};
    setPrefs({ ...before, [key]: on });
    try {
      setPrefs(await setNotificationPref(key, on));
    } catch {
      setPrefs(before);
      toast.error('Could not save that setting. Try again.', { label: 'Retry', onPress: () => void togglePref(key, on) });
    }
  };

  const openConsole = () => {
    void Linking.openURL(WEB_CONSOLE_URL).catch(() => toast.error('Could not open the web console.'));
  };

  return (
    <>
      <Screen
        back
        title="Settings"
        scroll
        right={<CircleButton icon="help" label="Contact support" onPress={() => contactSupport('Noni campaign manager support', profile?.full_name)} />}
      >
        {/* Switch accounts */}
        <Animated.View entering={FadeInDown.duration(260)} style={{ marginTop: space[2] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, backgroundColor: color.card, borderRadius: radius.card, ...shadow.card }}>
            {companyId ? <CompanyMark companyId={companyId} name={company} logoPath={active?.logoPath ?? null} size={44} /> : null}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={[text.row, { fontWeight: '700' }]}>
                {company}
              </Text>
              <Text numberOfLines={1} style={[text.meta, { marginTop: 1 }]}>
                {active ? (active.role === 'company_admin' ? 'Company admin' : sideLabel(sideForRole(active.role))) : 'Campaign manager'}
              </Text>
            </View>
            {canSwitch ? (
              <Press
                accessibilityRole="button"
                accessibilityLabel="Switch accounts"
                onPress={openSwitcher}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4, height: 36, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: color.blueTint }}
              >
                <Icon name="swap_horiz" size={17} color={color.blueDeep} />
                <Text style={{ fontSize: 13, fontWeight: '700', color: color.blueDeep }}>Switch accounts</Text>
              </Press>
            ) : null}
          </View>
        </Animated.View>

        {loadError ? (
          <Animated.View entering={FadeIn.duration(200)} style={{ marginTop: space[3] }}>
            <Press
              accessibilityRole="button"
              onPress={() => void load()}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: radius.card, backgroundColor: color.amberTint }}
            >
              <Icon name="cloud_off" size={20} color={color.amber} />
              <Text style={[text.body, { flex: 1, color: color.amber, fontWeight: '600' }]}>Could not load your team. Tap to retry.</Text>
              <Icon name="refresh" size={20} color={color.amber} />
            </Press>
          </Animated.View>
        ) : null}

        {/* Team */}
        <SettingsLabel right={canInviteManagers ? <TextButton label="Invite" onPress={() => setOpen('inviteManager')} /> : undefined}>
          Campaign managers
        </SettingsLabel>
        <Animated.View layout={LinearTransition.duration(220)}>
          <SettingsCard>
            {team === null ? (
              <View style={{ padding: 14, gap: 12 }}>
                <Skeleton h={36} style={skel} />
                <Skeleton h={36} style={skel} />
              </View>
            ) : (
              <>
                {team.map((m, i) => (
                  <View
                    key={m.id}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: i === team.length - 1 && pending.length === 0 ? 0 : 1, borderBottomColor: color.grey1 }}
                  >
                    <Avatar name={m.name} photo={m.photo} size={36} ring={false} />
                    <Text numberOfLines={1} style={[text.row, { flex: 1, fontSize: 16 }]}>
                      {m.name}
                      {m.id === profile?.id ? <Text style={{ color: color.grey4, fontWeight: '400' }}> (you)</Text> : null}
                    </Text>
                    <View style={{ height: 24, paddingHorizontal: 10, borderRadius: radius.pill, justifyContent: 'center', backgroundColor: m.role === 'company_admin' ? color.blueTint : color.grey1 }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: m.role === 'company_admin' ? color.blueDeep : color.grey4 }}>{roleLabel(m.role)}</Text>
                    </View>
                  </View>
                ))}
                {pending.map((p, i) => (
                  <View
                    key={p.id}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: i === pending.length - 1 ? 0 : 1, borderBottomColor: color.grey1 }}
                  >
                    <View style={{ width: 36, height: 36, borderRadius: radius.pill, backgroundColor: color.grey1, alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="schedule" size={18} color={color.grey4} />
                    </View>
                    <Text numberOfLines={1} style={[text.body, { flex: 1, color: color.grey4 }]}>
                      {p.email}
                    </Text>
                    <View style={{ height: 24, paddingHorizontal: 10, borderRadius: radius.pill, justifyContent: 'center', backgroundColor: color.amberTint }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: color.amber }}>Invited</Text>
                    </View>
                  </View>
                ))}
                {team.length === 0 && pending.length === 0 ? (
                  <View style={{ padding: 16 }}>
                    <SheetBody>Just you so far.</SheetBody>
                  </View>
                ) : null}
              </>
            )}
          </SettingsCard>
        </Animated.View>

        {/* Company */}
        <SettingsLabel>Company</SettingsLabel>
        <SettingsCard>
          <SettingsRow
            icon="person"
            label="Creators"
            value={summary ? String(summary.creatorCount) : undefined}
            onPress={() => router.push('/(admin)/creators')}
          />
          {managerAccess.inviteCreators ? (
            <SettingsRow icon="add" label="Invite a creator" onPress={() => setOpen('inviteCreator')} />
          ) : null}
          <SettingsRow
            icon="list_alt"
            label="Account template"
            sub="How creator accounts should look before you approve them"
            onPress={() => router.push('/(admin)/account-template')}
          />
          <SettingsRow
            icon="palette"
            label="Post text color"
            value={summary?.themeColor ? summary.themeColor : 'Classic'}
            last
            onPress={() => setOpen('theme')}
          />
        </SettingsCard>

        <SettingsCard>
          <SettingsRow
            icon="open_in_new"
            label="Open web console"
            sub="Brand Brain, features, team permissions and billing"
            external
            last
            onPress={openConsole}
          />
        </SettingsCard>

        {/* Notifications */}
        <SettingsLabel>Push notifications</SettingsLabel>
        <SettingsCard>
          {NOTIF_ROWS.map((row, i) => (
            <SettingsRow
              key={row.key}
              icon={row.icon}
              label={row.label}
              sub={row.sub}
              last={i === NOTIF_ROWS.length - 1}
              right={
                prefs === null ? (
                  <Skeleton w={48} h={28} r={radius.pill} style={skel} />
                ) : (
                  <Toggle on={prefOn(prefs, row.key)} accessibilityLabel={row.label} onChange={(v) => void togglePref(row.key, v)} />
                )
              }
            />
          ))}
        </SettingsCard>

        {/* Account */}
        <SettingsLabel>Account</SettingsLabel>
        <SettingsCard>
          <SettingsRow icon="help" label="Contact support" onPress={() => contactSupport('Noni campaign manager support', profile?.full_name)} />
          <SettingsRow icon="notes" label="Terms and conditions" last onPress={() => setOpen('terms')} />
        </SettingsCard>
        <SettingsCard>
          <SettingsRow icon="arrow_forward" label="Sign out" danger onPress={() => setOpen('signout')} />
          <SettingsRow icon="delete" label="Delete account" danger last onPress={() => setOpen('delete')} />
        </SettingsCard>

        <Text style={[text.meta, { textAlign: 'center', marginTop: space[3] }]}>
          {session?.user.email ? `Signed in as ${session.user.email}` : `Signed in to ${company}`}
        </Text>
      </Screen>

      <InviteSheet
        open={open === 'inviteManager'}
        onClose={() => setOpen(null)}
        title="Invite a campaign manager"
        body={`They get an email to join ${company} as a campaign manager. Your company admin sets what they can do on the web console.`}
        doneBody={(name) => `${name} is invited. They show up here once they sign in.`}
        send={async (name, email) => {
          if (!companyId) return;
          await inviteManager(companyId, name, email);
          setPending(await listPendingManagerInvites(companyId));
        }}
      />
      <InviteSheet
        open={open === 'inviteCreator'}
        onClose={() => setOpen(null)}
        title="Invite a creator"
        body={`They get an email that signs them into the creator app for ${company}. No setup on their end.`}
        doneBody={(name) => `${name} is invited. Signing in with that email lands them in the creator app for ${company}.`}
        send={async (name, email) => {
          if (!companyId) return;
          await inviteCreator(companyId, name, email);
        }}
      />
      <ThemeSheet
        open={open === 'theme'}
        onClose={() => setOpen(null)}
        current={summary?.themeColor ?? null}
        save={async (hex) => {
          if (!companyId) return;
          await saveOverlayThemeColor(companyId, hex);
          setSummary((s) => (s ? { ...s, themeColor: hex } : s));
        }}
      />
      <TermsSheet open={open === 'terms'} onClose={() => setOpen(null)} company={company} />
      <SignOutSheet open={open === 'signout'} onClose={() => setOpen(null)} company={company} signOut={signOut} />
      <DeleteSheet open={open === 'delete'} onClose={() => setOpen(null)} signOut={signOut} />
    </>
  );
}

function InviteSheet({
  open,
  onClose,
  title,
  body,
  doneBody,
  send,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  body: string;
  doneBody: (name: string) => string;
  send: (name: string, email: string) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName('');
      setEmail('');
      setSent(false);
      setError(null);
    }
  }
  const valid = name.trim().length > 0 && EMAIL_RE.test(email.trim());

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await send(name.trim(), email.trim().toLowerCase());
      setSent(true);
    } catch (e) {
      setError(errorText(e, 'Could not send the invite. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={sent ? 'Invite sent' : title}
      footer={sent ? <Button label="Done" onPress={onClose} /> : <ActionButton tone="primary" label="Send invite" busyLabel="Sending" busy={busy} disabled={!valid} onPress={() => void submit()} />}
    >
      {sent ? (
        <Animated.View entering={FadeInDown.duration(240)} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
          <Icon name="check_circle" size={22} color={color.green} />
          <View style={{ flex: 1 }}>
            <SheetBody>{doneBody(name.trim())}</SheetBody>
          </View>
        </Animated.View>
      ) : (
        <View>
          <View style={{ marginBottom: space[4] }}>
            <SheetBody>{body}</SheetBody>
          </View>
          <Field value={name} onChange={setName} placeholder="Name" autoCapitalize="words" accessibilityLabel="Name" />
          <Field
            value={email}
            onChange={setEmail}
            placeholder="Email"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            accessibilityLabel="Email"
          />
          {error ? <SheetBody tone="error">{error}</SheetBody> : null}
        </View>
      )}
    </Sheet>
  );
}

function ThemeSheet({ open, onClose, current, save }: { open: boolean; onClose: () => void; current: string | null; save: (hex: string | null) => Promise<void> }) {
  const [draft, setDraft] = useState(current ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setDraft(current ?? '');
      setError(null);
    }
  }
  const raw = draft.trim();
  const valid = raw === '' || HEX_RE.test(raw);
  const hex = raw === '' ? null : `#${raw.replace('#', '').toUpperCase()}`;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await save(hex);
      onClose();
    } catch (e) {
      setError(errorText(e, 'Could not save. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Post text color"
      footer={<ActionButton tone="primary" label="Save color" busyLabel="Saving" busy={busy} disabled={!valid} onPress={() => void submit()} />}
    >
      <View style={{ marginBottom: space[4] }}>
        <SheetBody>One color for every post. Text boxes set to Theme use it as their bubble. Pick Classic to keep white TikTok text.</SheetBody>
      </View>
      <View style={{ height: 112, borderRadius: radius.option, backgroundColor: color.ink, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 }}>
        {valid && hex ? (
          <Text
            style={{
              fontFamily: OVERLAY_TEXT_SPEC.bubble.fontFamily,
              fontWeight: OVERLAY_TEXT_SPEC.bubble.fontWeight,
              fontSize: 17,
              lineHeight: 22,
              textAlign: 'center',
              paddingHorizontal: 14,
              paddingVertical: 10,
              borderRadius: radius.option,
              overflow: 'hidden',
              color: overlayTextContrast(hex),
              backgroundColor: overlayBoxFill(hex),
            }}
          >
            Your hook goes here
          </Text>
        ) : (
          <OutlinedText text="Your hook goes here" fontSize={17} color={CLASSIC_TEXT_COLOR} style={{ lineHeight: 22, textAlign: 'center' }} />
        )}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 14, marginBottom: 14 }}>
        <Press
          accessibilityRole="button"
          accessibilityLabel="Classic white text"
          accessibilityState={{ selected: raw === '' }}
          onPress={() => setDraft('')}
          style={{ width: 36, height: 36, borderRadius: radius.pill, backgroundColor: color.card, borderWidth: raw === '' ? 3 : 1, borderColor: raw === '' ? color.blue : color.grey2, alignItems: 'center', justifyContent: 'center' }}
        >
          <Icon name="close" size={16} color={color.grey4} />
        </Press>
        {TEXT_THEME_SWATCHES.map((s) => {
          const on = raw.toUpperCase().replace('#', '') === s.slice(1);
          return (
            <Press
              key={s}
              accessibilityRole="button"
              accessibilityLabel={s}
              accessibilityState={{ selected: on }}
              onPress={() => setDraft(s)}
              style={{ width: 36, height: 36, borderRadius: radius.pill, backgroundColor: s, borderWidth: on ? 3 : 1, borderColor: on ? color.blue : color.grey2 }}
            />
          );
        })}
      </View>
      <Field value={draft} onChange={setDraft} placeholder="Custom hex, like #1A73E8" autoCapitalize="characters" autoCorrect={false} accessibilityLabel="Custom hex color" />
      {!valid ? <SheetBody tone="error">Use six hex digits, like #1A73E8.</SheetBody> : null}
      {error ? <SheetBody tone="error">{error}</SheetBody> : null}
    </Sheet>
  );
}

function TermsSheet({ open, onClose, company }: { open: boolean; onClose: () => void; company: string }) {
  const terms: Array<[string, string]> = [
    ['Your account', `You use Noni on behalf of ${company}. The company admin can grant or remove your access at any time.`],
    ['Content and approvals', 'Approving a post tells the creator it is ready. The creator posts it from their own TikTok and Instagram. Review every post before you approve it.'],
    ['Data', 'Analytics come from the connected platforms. Noni stores only what it needs to run briefs, reviews and messages.'],
    ['Leaving', 'Deleting your account removes your sign-in, your profile and your preferences. Posts, creators and company data stay with the company.'],
  ];
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Terms and conditions"
      footer={
        <>
          <Button variant="quiet" label="Full terms" onPress={() => void Linking.openURL(TERMS_URL).catch(() => toast.error('Could not open the terms.'))} />
          <Button label="Done" onPress={onClose} />
        </>
      }
    >
      <View style={{ gap: 14 }}>
        {terms.map(([h, b]) => (
          <View key={h}>
            <Text style={{ fontSize: 12, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase', color: color.grey4 }}>{h}</Text>
            <Text style={[text.body, { marginTop: 4, lineHeight: 21 }]}>{b}</Text>
          </View>
        ))}
      </View>
    </Sheet>
  );
}

function SignOutSheet({ open, onClose, company, signOut }: { open: boolean; onClose: () => void; company: string; signOut: () => Promise<void> }) {
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
      <SheetBody>{`Posts waiting for ${company} stay in the queue. Sign back in anytime with the same email.`}</SheetBody>
    </Sheet>
  );
}

function DeleteSheet({ open, onClose, signOut }: { open: boolean; onClose: () => void; signOut: () => Promise<void> }) {
  const [state, setState] = useState<DeleteState>({ kind: 'checking' });
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setState({ kind: 'checking' });
    setConfirm('');
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
  }, [open]);

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
      toast.error(errorText(e, 'Could not delete your account. Try again.'));
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
          <>
            <ActionButton tone="quiet" label="Close" onPress={onClose} />
            <ActionButton tone="primary" label="Open web console" onPress={() => void Linking.openURL(WEB_CONSOLE_URL).catch(() => undefined)} />
          </>
        ) : (
          <>
            <ActionButton tone="quiet" label="Keep it" disabled={busy} onPress={onClose} />
            <ActionButton
              label="Delete"
              busyLabel="Deleting"
              busy={busy}
              disabled={state.kind === 'checking' || !confirmed}
              onPress={() => void run()}
            />
          </>
        )
      }
    >
      {state.kind === 'blocked' ? (
        <Animated.View entering={FadeIn.duration(200)}>
          <SheetBody>
            {`You are the only admin of ${state.companies.join(', ')}, and other people still work there. Make another member an admin on the web console, then delete your account here.`}
          </SheetBody>
        </Animated.View>
      ) : (
        <View>
          <SheetBody>
            This permanently deletes your sign-in, profile and notification settings. Posts, creators and company data stay with the company. This cannot be undone.
          </SheetBody>
          <Text style={[text.meta, { marginTop: space[4], marginBottom: 6 }]}>Type DELETE to confirm</Text>
          <TextInput
            value={confirm}
            onChangeText={setConfirm}
            editable={!busy && state.kind !== 'checking'}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder="DELETE"
            placeholderTextColor={color.grey3}
            accessibilityLabel="Type DELETE to confirm"
            style={{ height: 48, borderRadius: radius.option, backgroundColor: color.grey1, paddingHorizontal: 14, fontSize: 16, fontWeight: '600', color: color.ink }}
          />
          {state.kind === 'checking' ? (
            <Text style={[text.meta, { marginTop: 8 }]}>Checking your companies</Text>
          ) : state.kind === 'error' ? (
            <View style={{ marginTop: 8 }}>
              <SheetBody tone="error">{state.message}</SheetBody>
            </View>
          ) : null}
        </View>
      )}
    </Sheet>
  );
}
