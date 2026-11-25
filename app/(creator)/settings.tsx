// Creator Settings: profile (photo, name), the company and account switchers,
// connected TikTok and Instagram, push categories, support, sign out and delete.
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Linking, Platform, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Notifications from 'expo-notifications';
import { useFocusEffect, useRouter } from 'expo-router';
import Animated, { FadeIn, FadeInDown, LinearTransition } from 'react-native-reanimated';

import { AccountSwitcherSheet } from '../../components/AccountSwitcherSheet';
import { CircleButton, SettingsCard, SettingsLabel, SettingsRow } from '../../components/admin/v2/settings/SettingsParts';
import { DeleteSheet, NameSheet, SignOutSheet } from '../../components/creator/v2/settings/AccountSheets';
import { CompanyMark } from '../../components/shared/CompanyMark';
import { Avatar, Chip, Icon, Press, Screen, Skeleton, Toggle } from '../../components/v2';
import { toast } from '../../components/v2/Toast';
import { getNotificationPrefs, prefOn, setNotificationPref, type NotificationCategory, type NotificationPrefs } from '../../lib/account-api';
import { modesForProfile } from '../../lib/active-mode';
import { TERMS_URL } from '../../lib/admin-settings-api';
import { useAuth } from '../../lib/auth';
import { useCompany } from '../../lib/company-context';
import {
  handleStateLabel,
  loadCreatorAccountsView,
  saveMyName,
  signedAvatarUrl,
  uploadMyAvatar,
  type CreatorAccountsView,
  type HandleState,
} from '../../lib/creator-settings-api';
import { registerPushToken } from '../../lib/notifications';
import { contactSupport } from '../../lib/support';
import { color, radius, shadow, space, text, type Tone } from '../../theme/v2';

type OpenSheet = 'name' | 'signout' | 'delete' | null;

const NOTIF_ROWS: { key: NotificationCategory; label: string; sub: string; icon: 'check_circle' | 'mark_chat_unread' | 'trending_up' | 'bookmark' }[] = [
  { key: 'briefs', label: 'New briefs', sub: 'Your team publishes a new brief', icon: 'bookmark' },
  { key: 'reviews', label: 'Post reviews', sub: 'A post is approved or needs changes', icon: 'check_circle' },
  { key: 'messages', label: 'Messages', sub: 'Your campaign managers write to you', icon: 'mark_chat_unread' },
  { key: 'live', label: 'Posts going live', sub: 'An approved post is up on your accounts', icon: 'trending_up' },
];

const STATE_TONE: Record<HandleState, Tone> = { verified: 'green', in_review: 'amber', changes: 'amber', draft: 'grey', missing: 'grey' };

/** Shimmer block inside a white card. */
const skel = { backgroundColor: color.grey1, marginBottom: 0, boxShadow: 'none' } as const;

export default function CreatorSettingsScreen() {
  const router = useRouter();
  const { profile, session, activeMode, setActiveMode, signOut, refreshProfile } = useAuth();
  const { active, summaryRows, openSwitcher } = useCompany();
  const companyId = profile?.active_company_id;
  const company = active?.name ?? 'your company';

  const [open, setOpen] = useState<OpenSheet>(null);
  const [switcher, setSwitcher] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [accounts, setAccounts] = useState<CreatorAccountsView | null>(null);
  const [accountsError, setAccountsError] = useState(false);
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [pushGranted, setPushGranted] = useState<boolean | null>(null);
  const [switchingMode, setSwitchingMode] = useState(false);

  const avatarPath = profile?.avatar_path ?? null;
  useEffect(() => {
    let cancelled = false;
    void signedAvatarUrl(avatarPath).then((url) => {
      if (!cancelled) setPhoto(url);
    });
    return () => {
      cancelled = true;
    };
  }, [avatarPath]);

  const loadAccounts = useCallback(async () => {
    if (!companyId || !profile) return;
    setAccountsError(false);
    try {
      setAccounts(await loadCreatorAccountsView(companyId, profile.id));
    } catch {
      setAccountsError(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, profile?.id]);

  const loadPushStatus = useCallback(async () => {
    if (Platform.OS === 'web') {
      setPushGranted(false);
      return;
    }
    try {
      const { status } = await Notifications.getPermissionsAsync();
      setPushGranted(status === 'granted');
    } catch {
      setPushGranted(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadAccounts();
      void loadPushStatus();
      if (profile) {
        void getNotificationPrefs(profile.id)
          .then(setPrefs)
          .catch(() => setPrefs({}));
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loadAccounts, loadPushStatus, profile?.id]),
  );

  // Coming back from the OS settings app picks up a permission change.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void loadPushStatus();
    });
    return () => sub.remove();
  }, [loadPushStatus]);

  const allowPush = async () => {
    if (Platform.OS === 'web') return;
    try {
      const current = await Notifications.getPermissionsAsync();
      if (current.status === 'granted') {
        setPushGranted(true);
        return;
      }
      if (current.canAskAgain) {
        const { status } = await Notifications.requestPermissionsAsync();
        setPushGranted(status === 'granted');
        if (status === 'granted' && profile) void registerPushToken(profile.id);
        return;
      }
      await Linking.openSettings();
    } catch {
      toast.error('Could not update notifications. Try again.');
    }
  };

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

  const changePhoto = async () => {
    if (!companyId || !profile || uploading) return;
    let result: ImagePicker.ImagePickerResult;
    try {
      result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.9 });
    } catch {
      toast.error('Could not open your photos. Check photo access in Settings.');
      return;
    }
    const asset = result.canceled ? undefined : result.assets[0];
    if (!asset) return;
    const before = photo;
    setPhoto(asset.uri);
    setUploading(true);
    try {
      await uploadMyAvatar(companyId, profile.id, asset.uri);
      await refreshProfile();
      setPhoto((await signedAvatarUrl(`${companyId}/${profile.id}.jpg`)) ?? asset.uri);
      toast.success('Photo updated');
    } catch (e) {
      setPhoto(before);
      toast.error(e instanceof Error ? e.message : 'Could not update your photo. Try again.', { label: 'Retry', onPress: () => void changePhoto() });
    } finally {
      setUploading(false);
    }
  };

  const canManage = !!profile && modesForProfile(profile).includes('admin');
  const switchToManager = async () => {
    setSwitchingMode(true);
    try {
      await setActiveMode('admin');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not switch. Try again.');
    } finally {
      setSwitchingMode(false);
    }
  };

  const name = profile?.full_name?.trim() || 'Add your name';
  const accountsHref = '/(creator)/account-setup' as const;
  const connected = accounts?.publishing ? accounts.publishing.tiktok.connected && accounts.publishing.instagram.connected : null;

  return (
    <>
      <Screen back title="Settings" scroll right={<CircleButton icon="help" label="Contact support" onPress={() => contactSupport('Noni creator support', profile?.full_name)} />}>
        {/* Profile */}
        <Animated.View entering={FadeInDown.duration(260)} style={{ marginTop: space[2], alignItems: 'center', paddingVertical: space[4] }}>
          <Press accessibilityRole="button" accessibilityLabel="Change photo" onPress={() => void changePhoto()} disabled={uploading}>
            <Avatar name={profile?.full_name ?? undefined} photo={photo} size={88} />
            <View style={{ position: 'absolute', right: -4, bottom: -4, width: 32, height: 32, borderRadius: radius.pill, backgroundColor: color.blue, alignItems: 'center', justifyContent: 'center', boxShadow: `0 0 0 3px ${color.bg}` }}>
              {uploading ? <ActivityIndicator size="small" color={color.white} /> : <Icon name="photo_camera" size={17} color={color.white} />}
            </View>
          </Press>
          <Press accessibilityRole="button" accessibilityLabel="Edit name" onPress={() => setOpen('name')} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: space[3], paddingHorizontal: 12, minHeight: 44 }}>
            <Text numberOfLines={1} style={[text.card, { flexShrink: 1, color: profile?.full_name?.trim() ? color.ink : color.grey4 }]}>
              {name}
            </Text>
            <Icon name="edit" size={18} color={color.grey3} />
          </Press>
          {session?.user.email ? <Text style={text.meta}>{session.user.email}</Text> : null}
        </Animated.View>

        {/* Company */}
        <SettingsLabel>Company</SettingsLabel>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, marginBottom: space[2], backgroundColor: color.card, borderRadius: radius.card, ...shadow.card }}>
          {companyId ? <CompanyMark companyId={companyId} name={company} logoPath={active?.logoPath ?? null} size={44} /> : null}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={[text.row, { fontWeight: '700' }]}>
              {company}
            </Text>
            <Text numberOfLines={1} style={[text.meta, { marginTop: 1 }]}>
              Creator
            </Text>
          </View>
          {summaryRows.length > 1 ? (
            <Press
              accessibilityRole="button"
              accessibilityLabel="Switch company"
              onPress={openSwitcher}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, height: 36, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: color.blueTint }}
            >
              <Icon name="swap_horiz" size={17} color={color.blueDeep} />
              <Text style={{ fontSize: 13, fontWeight: '700', color: color.blueDeep }}>Switch</Text>
            </Press>
          ) : null}
        </View>

        {/* Connected accounts */}
        <SettingsLabel>Your accounts</SettingsLabel>
        {accountsError ? (
          <Animated.View entering={FadeIn.duration(200)}>
            <Press
              accessibilityRole="button"
              onPress={() => void loadAccounts()}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, marginBottom: space[2], borderRadius: radius.card, backgroundColor: color.amberTint }}
            >
              <Icon name="cloud_off" size={20} color={color.amber} />
              <Text style={[text.body, { flex: 1, color: color.amber, fontWeight: '600' }]}>Could not load your accounts. Tap to retry.</Text>
              <Icon name="refresh" size={20} color={color.amber} />
            </Press>
          </Animated.View>
        ) : null}
        <Animated.View layout={LinearTransition.duration(220)}>
          <SettingsCard>
            {accounts === null && !accountsError ? (
              <View style={{ padding: 14, gap: 12 }}>
                <Skeleton h={36} style={skel} />
                <Skeleton h={36} style={skel} />
                <Skeleton h={36} style={skel} />
              </View>
            ) : accounts ? (
              <>
                {(['tiktok', 'instagram'] as const).map((k) => {
                  const a = accounts[k];
                  return (
                    <SettingsRow
                      key={k}
                      icon={k === 'tiktok' ? 'music_note' : 'photo_camera'}
                      label={k === 'tiktok' ? 'TikTok' : 'Instagram'}
                      sub={a.handle ?? 'Not added yet'}
                      right={<Chip small tone={STATE_TONE[a.state]} label={handleStateLabel(a.state)} />}
                      onPress={() => router.push(accountsHref)}
                    />
                  );
                })}
                {accounts.reason ? (
                  <View style={{ paddingHorizontal: 14, paddingVertical: 10, backgroundColor: color.amberTint }}>
                    <Text style={[text.meta, { color: color.amber }]}>{accounts.reason}</Text>
                  </View>
                ) : null}
                <SettingsRow
                  icon="link"
                  label="Publishing"
                  sub={
                    accounts.publishing
                      ? connected
                        ? 'Approved posts publish automatically'
                        : `${[accounts.publishing.tiktok.connected ? null : 'TikTok', accounts.publishing.instagram.connected ? null : 'Instagram'].filter(Boolean).join(' and ')} not connected`
                      : 'Could not check right now'
                  }
                  right={connected === null ? undefined : <Chip small tone={connected ? 'green' : 'amber'} label={connected ? 'Connected' : 'Connect'} />}
                  last
                  onPress={() => router.push('/(creator)/setup/connect')}
                />
              </>
            ) : null}
          </SettingsCard>
        </Animated.View>

        {/* Notifications */}
        <SettingsLabel>Push notifications</SettingsLabel>
        <SettingsCard>
          {pushGranted === false ? (
            <SettingsRow icon="info" label="Notifications are off" sub="Allow them to hear about reviews and messages" right={<Chip small tone="blue" label="Allow" />} onPress={() => void allowPush()} />
          ) : null}
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
          <SettingsRow icon="edit" label="Profile" onPress={() => router.push('/(creator)/market/profile')} />
          {canManage ? (
            <SettingsRow
              icon="swap_horiz"
              label={activeMode === 'creator' ? 'Switch to campaign manager' : 'Switch view'}
              right={switchingMode ? <ActivityIndicator size="small" color={color.grey4} /> : undefined}
              onPress={switchingMode ? undefined : () => void switchToManager()}
            />
          ) : null}
          <SettingsRow icon="person" label="Switch accounts" sub="Sign in with another email" onPress={() => setSwitcher(true)} />
          <SettingsRow icon="help" label="Contact support" onPress={() => contactSupport('Noni creator support', profile?.full_name)} />
          <SettingsRow icon="notes" label="Terms and conditions" external last onPress={() => void Linking.openURL(TERMS_URL).catch(() => toast.error('Could not open the terms.'))} />
        </SettingsCard>
        <SettingsCard>
          <SettingsRow icon="arrow_forward" label="Sign out" danger onPress={() => setOpen('signout')} />
          <SettingsRow icon="delete" label="Delete account" danger last onPress={() => setOpen('delete')} />
        </SettingsCard>

        <Text style={[text.meta, { textAlign: 'center', marginTop: space[3] }]}>{`Signed in as a creator for ${company}`}</Text>
      </Screen>

      <NameSheet
        open={open === 'name'}
        onClose={() => setOpen(null)}
        current={profile?.full_name ?? ''}
        save={async (next) => {
          if (!profile) return;
          await saveMyName(profile.id, next);
          await refreshProfile();
        }}
      />
      <SignOutSheet open={open === 'signout'} onClose={() => setOpen(null)} company={company} signOut={signOut} />
      <DeleteSheet open={open === 'delete'} onClose={() => setOpen(null)} signOut={signOut} />
      <AccountSwitcherSheet visible={switcher} onClose={() => setSwitcher(false)} />
    </>
  );
}
