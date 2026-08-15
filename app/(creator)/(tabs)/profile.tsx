import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Alert,
  Animated,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as ImagePicker from 'expo-image-picker';
import * as WebBrowser from 'expo-web-browser';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '../../../components/ui/Icon';
import { PressableScale } from '../../../components/ui/PressableScale';
import { SkeletonLine } from '../../../components/ui/Skeleton';
import {
  getSocialConnectStatus,
  getSocialConnectUrl,
  type SocialConnectStatus,
} from '../../../lib/admin-api';
import { modesForProfile } from '../../../lib/active-mode';
import { useAuth } from '../../../lib/auth';
import { getCompany, saveCreatorBasics, uploadAvatar } from '../../../lib/onboarding';
import { useSetupState } from '../../../lib/setup';
import { contactSupport } from '../../../lib/support';
import { supabase } from '../../../lib/supabase';
import { formatCents, getOrCreateWallet } from '../../../lib/wallet-api';
import {
  borderWidth,
  color,
  motion,
  radius,
  shadow,
  space,
  type,
} from '../../../theme/tokens';

const TERMS_URL = 'https://www.usenoni.app/terms';

type AccountInfo = {
  connected: boolean;
  handle: string | null;
  followers: number | null;
};

async function unreadAdminCount(
  companyId: string,
  creatorId: string,
): Promise<number> {
  const seenAt = await AsyncStorage.getItem(`noni.chat.seenAt.${creatorId}`);
  let query = supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('creator_id', creatorId)
    .neq('author_id', creatorId);
  if (seenAt !== null) {
    query = query.gt('created_at', seenAt);
  }
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

function parseAccount(value: unknown): AccountInfo {
  if (!value) return { connected: false, handle: null, followers: null };
  if (typeof value === 'string') {
    return value.length > 0
      ? { connected: true, handle: value, followers: null }
      : { connected: false, handle: null, followers: null };
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const handle =
      typeof obj.username === 'string'
        ? obj.username
        : typeof obj.display_name === 'string'
          ? obj.display_name
          : null;
    const raw = obj.followers ?? obj.follower_count;
    const followers =
      typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : null;
    return { connected: true, handle, followers };
  }
  return { connected: true, handle: null, followers: null };
}

function formatFollowers(n: number): string {
  if (n >= 1_000_000) return `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return `${n}`;
}

function accountSub(info: AccountInfo): string {
  if (!info.connected) return 'Not connected';
  if (!info.handle) return 'Connected';
  const handle = `@${info.handle.replace(/^@/, '')}`;
  return info.followers !== null
    ? `${handle} · ${formatFollowers(info.followers)} followers`
    : handle;
}

function GroupCard({ children }: { children: ReactNode }) {
  return <View style={[styles.groupCard, shadow.shadowCard]}>{children}</View>;
}

function Row({
  icon,
  label,
  sub,
  badge,
  danger = false,
  right,
  last = false,
  onPress,
}: {
  icon: IconName;
  label: string;
  sub?: string;
  badge?: number;
  danger?: boolean;
  right?: ReactNode;
  last?: boolean;
  onPress?: () => void;
}) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.row, !last && styles.rowBorder]}
    >
      <Icon name={icon} size={19} color={danger ? color.danger : color.slate500} />
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, danger && { color: color.danger }]}>
          {label}
        </Text>
        {sub !== undefined && (
          <Text numberOfLines={1} style={styles.rowSub}>
            {sub}
          </Text>
        )}
      </View>
      {right !== undefined ? (
        right
      ) : badge !== undefined && badge > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge > 99 ? '99+' : String(badge)}</Text>
        </View>
      ) : !danger ? (
        <Icon name="chevron-right" size={17} color={color.slate300} />
      ) : null}
    </PressableScale>
  );
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profile, refreshProfile, setActiveMode, signOut } = useAuth();
  const setup = useSetupState(profile);

  const [status, setStatus] = useState<SocialConnectStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [connectBusy, setConnectBusy] = useState(false);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [availableCents, setAvailableCents] = useState<number | null>(null);
  const [unread, setUnread] = useState(0);
  const [switcherOpen, setSwitcherOpen] = useState(false);

  const pop = useRef(new Animated.Value(0)).current;

  const loadStatus = useCallback(async () => {
    try {
      setStatus(await getSocialConnectStatus());
    } catch {
      setStatus(null);
    } finally {
      setStatusLoading(false);
    }
  }, []);

  const loadWallet = useCallback(async () => {
    if (!profile?.id || !profile.company_id) return;
    try {
      const w = await getOrCreateWallet(profile.company_id, profile.id);
      setAvailableCents(w.available_cents);
    } catch {
      setAvailableCents(null);
    }
  }, [profile?.id, profile?.company_id]);

  const loadUnread = useCallback(async () => {
    if (!profile?.id || !profile.company_id) return;
    try {
      setUnread(await unreadAdminCount(profile.company_id, profile.id));
    } catch {
      setUnread(0);
    }
  }, [profile?.id, profile?.company_id]);

  useFocusEffect(
    useCallback(() => {
      void loadStatus();
      void loadWallet();
      void loadUnread();
    }, [loadStatus, loadWallet, loadUnread]),
  );

  useEffect(() => {
    const companyId = profile?.company_id;
    if (!companyId) return;
    let cancelled = false;
    void getCompany(companyId)
      .then((company) => {
        if (!cancelled) setCompanyName(company.name);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [profile?.company_id]);

  useEffect(() => {
    const path = profile?.avatar_path;
    if (!path) {
      setAvatarUrl(null);
      return;
    }
    let cancelled = false;
    void supabase.storage
      .from('avatars')
      .createSignedUrl(path, 3600)
      .then(({ data }) => {
        if (!cancelled && data) setAvatarUrl(data.signedUrl);
      });
    return () => {
      cancelled = true;
    };
  }, [profile?.avatar_path]);

  function openSwitcher() {
    setSwitcherOpen(true);
    pop.setValue(0);
    Animated.timing(pop, {
      toValue: 1,
      duration: motion.fast,
      easing: motion.easeOut,
      useNativeDriver: true,
    }).start();
  }

  async function connect() {
    if (connectBusy) return;
    setConnectBusy(true);
    try {
      const url = await getSocialConnectUrl();
      await WebBrowser.openBrowserAsync(url);
      await loadStatus();
    } catch (e) {
      Alert.alert('Connect failed', e instanceof Error ? e.message : 'Try again');
    } finally {
      setConnectBusy(false);
    }
  }

  async function pickAvatar() {
    if (!profile || avatarBusy) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Photos needed', 'Noni needs photo access for your profile picture.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (result.canceled || !result.assets[0]) return;
    setAvatarBusy(true);
    try {
      const path = await uploadAvatar(profile.company_id, profile.id, result.assets[0].uri);
      await saveCreatorBasics(profile.id, profile.full_name ?? '', path);
      await refreshProfile();
    } catch (e) {
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Try again');
    } finally {
      setAvatarBusy(false);
    }
  }

  async function switchToManager() {
    setSwitcherOpen(false);
    try {
      await setActiveMode('admin');
    } catch (e) {
      Alert.alert('Could not switch', e instanceof Error ? e.message : 'Try again');
    }
  }

  function confirmSignOut() {
    Alert.alert(
      'Sign out?',
      'You can sign back in anytime with the same email.',
      [
        { text: 'Stay signed in', style: 'cancel' },
        { text: 'Sign out', style: 'destructive', onPress: () => void signOut() },
      ],
    );
  }

  function deleteAccount() {
    Alert.alert(
      'Delete account',
      'Account deletion goes through support so your posts and balance are handled correctly.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Contact support',
          onPress: () => contactSupport('Delete my Noni account', profile?.full_name),
        },
      ],
    );
  }

  if (!profile) return null;

  const accounts = status?.social_accounts ?? {};
  const instagram = parseAccount(accounts.instagram);
  const tiktok = parseAccount(accounts.tiktok);

  const name = profile.full_name?.trim() || 'Creator';
  const initial = name.charAt(0).toUpperCase();
  const handle = status?.profile ? `@${status.profile.replace(/^@/, '')}` : null;
  const company = companyName ?? 'Your company';
  const companyInitial = company.charAt(0).toUpperCase();
  const canManage = modesForProfile(profile).includes('admin');
  const bankConnected = setup.state?.bank === 'done';
  const version = Constants.expoConfig?.version ?? '1.0.0';

  const popStyle = {
    opacity: pop,
    transform: [
      { scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) },
      { translateY: pop.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] }) },
    ],
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + space[2] },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Switch role"
          onPress={openSwitcher}
          style={styles.rolePill}
        >
          <View style={styles.roleTile}>
            <Text style={styles.roleTileText}>{companyInitial}</Text>
          </View>
          <Text numberOfLines={1} style={styles.rolePillText}>
            Creator
          </Text>
          <View style={styles.chevrons}>
            <Icon name="chevron-up" size={11} color={color.slate400} />
            <Icon name="chevron-down" size={11} color={color.slate400} />
          </View>
        </PressableScale>

        <View style={styles.identity}>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="Change profile photo"
            disabled={avatarBusy}
            onPress={() => void pickAvatar()}
            style={styles.avatarWrap}
          >
            {avatarUrl !== null ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Text style={styles.avatarInitial}>{initial}</Text>
              </View>
            )}
            <View style={styles.cameraBadge}>
              <Icon name="camera" size={13} color={color.white} />
            </View>
          </PressableScale>
          <View style={styles.identityText}>
            <Text numberOfLines={1} style={styles.name}>
              {name}
            </Text>
            <Text numberOfLines={1} style={styles.identitySub}>
              {handle ?? 'Tap the photo to add one'}
            </Text>
          </View>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="Edit account setup"
            onPress={() => router.push('/(creator)/account-setup' as Href)}
            style={styles.editBtn}
          >
            <Text style={styles.editBtnText}>Edit</Text>
          </PressableScale>
        </View>

        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Open earnings"
          onPress={() => router.push('/(creator)/balance' as Href)}
          style={styles.earningsCard}
        >
          <View style={styles.earningsText}>
            <Text style={styles.earningsLabel}>CURRENT EARNINGS</Text>
            <Text style={styles.earningsAmount}>
              {availableCents !== null ? formatCents(availableCents) : '$0.00'}
            </Text>
            <Text style={styles.earningsSub}>
              {bankConnected
                ? 'Pays out Sunday at 8PM Eastern'
                : 'Connect your bank to get paid'}
            </Text>
          </View>
          <View style={styles.earningsChevron}>
            <Icon name="chevron-right" size={18} color={color.ink} />
          </View>
        </PressableScale>

        <View style={styles.group}>
          <Text style={styles.groupLabel}>Your accounts</Text>
          <GroupCard>
            {(
              [
                { icon: 'at-sign' as IconName, label: 'Instagram', info: instagram },
                { icon: 'music-2' as IconName, label: 'TikTok', info: tiktok },
              ]
            ).map((row, i) => (
              <View
                key={row.label}
                style={[styles.row, i === 0 && styles.rowBorder]}
              >
                <Icon name={row.icon} size={19} color={color.slate500} />
                <View style={styles.rowText}>
                  <Text style={styles.rowLabel}>{row.label}</Text>
                  {statusLoading ? (
                    <SkeletonLine width={140} height={13} radius={6} />
                  ) : (
                    <Text numberOfLines={1} style={styles.rowSub}>
                      {accountSub(row.info)}
                    </Text>
                  )}
                </View>
                {!statusLoading &&
                  (row.info.connected ? (
                    <View style={styles.connectedChip}>
                      <View style={styles.connectedDot} />
                      <Text style={styles.connectedText}>Connected</Text>
                    </View>
                  ) : (
                    <PressableScale
                      accessibilityRole="button"
                      accessibilityLabel={`Connect ${row.label}`}
                      disabled={connectBusy}
                      onPress={() => void connect()}
                      style={styles.connectBtn}
                    >
                      <Text style={styles.connectBtnText}>Connect</Text>
                    </PressableScale>
                  ))}
              </View>
            ))}
          </GroupCard>
        </View>

        <View style={styles.group}>
          <Text style={styles.groupLabel}>Inbox and setup</Text>
          <GroupCard>
            <Row
              icon="message-circle"
              label="Messages"
              badge={unread}
              onPress={() => router.push('/(creator)/messages' as Href)}
            />
            <Row
              icon="settings"
              label="Account setup"
              sub="Name, bio and verification"
              last
              onPress={() => router.push('/(creator)/account-setup' as Href)}
            />
          </GroupCard>
        </View>

        <View style={styles.group}>
          <Text style={styles.groupLabel}>Settings</Text>
          <GroupCard>
            {canManage && (
              <Row
                icon="arrow-left-right"
                label="Switch to campaign manager"
                onPress={() => void switchToManager()}
              />
            )}
            <Row
              icon="bell"
              label="Notifications"
              onPress={() => router.push('/(creator)/settings' as Href)}
            />
            <Row
              icon="message-circle"
              label="Contact support"
              last
              onPress={() => contactSupport('Noni creator support', profile.full_name)}
            />
          </GroupCard>
        </View>

        <View style={styles.group}>
          <Text style={styles.groupLabel}>Legal</Text>
          <GroupCard>
            <Row
              icon="key-round"
              label="Privacy and terms"
              onPress={() => void WebBrowser.openBrowserAsync(TERMS_URL)}
            />
            <Row
              icon="trash-2"
              label="Delete account"
              danger
              last
              onPress={deleteAccount}
            />
          </GroupCard>
        </View>

        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Sign out"
          onPress={confirmSignOut}
          style={styles.signOut}
        >
          <Text style={styles.signOutText}>Sign out</Text>
        </PressableScale>

        <Text style={styles.footer}>
          {`Signed in as creator · ${company} · Noni ${version}`}
        </Text>
      </ScrollView>

      {switcherOpen && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close role switcher"
          style={styles.popScrim}
          onPress={() => setSwitcherOpen(false)}
        >
          <Animated.View
            style={[
              styles.popover,
              shadow.shadowRaised,
              { top: insets.top + 56 },
              popStyle,
            ]}
          >
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="Creator, current role"
              onPress={() => setSwitcherOpen(false)}
              style={styles.popRow}
            >
              <View style={styles.roleTile}>
                <Text style={styles.roleTileText}>{companyInitial}</Text>
              </View>
              <Text numberOfLines={1} style={styles.popRowText}>
                Creator
              </Text>
              <Icon name="check" size={16} color={color.accent} />
            </PressableScale>
            {canManage && (
              <PressableScale
                accessibilityRole="button"
                accessibilityLabel="Switch to Campaign Manager"
                onPress={() => void switchToManager()}
                style={[styles.popRow, styles.popRowBorder]}
              >
                <View style={styles.roleTile}>
                  <Text style={styles.roleTileText}>{companyInitial}</Text>
                </View>
                <Text numberOfLines={1} style={styles.popRowText}>
                  Campaign Manager
                </Text>
              </PressableScale>
            )}
          </Animated.View>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: color.offWhite,
  },
  flex: {
    flex: 1,
  },
  content: {
    paddingHorizontal: space.gutter,
    paddingBottom: 130,
    gap: space[6],
  },
  rolePill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: space[2],
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    backgroundColor: color.fillQuiet,
    maxWidth: '86%',
  },
  roleTile: {
    width: 24,
    height: 24,
    borderRadius: 7,
    backgroundColor: color.blue100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleTileText: {
    fontSize: type.size.label,
    fontWeight: type.weight.heavy,
    color: color.blue700,
  },
  rolePillText: {
    flexShrink: 1,
    fontSize: type.size.meta,
    fontWeight: type.weight.bold,
    color: color.ink,
  },
  chevrons: {
    alignItems: 'center',
    marginVertical: -2,
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[5],
  },
  avatarWrap: {
    width: 68,
    height: 68,
  },
  avatar: {
    width: 68,
    height: 68,
    borderRadius: radius.pill,
  },
  avatarFallback: {
    backgroundColor: color.blue100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 26,
    fontWeight: type.weight.heavy,
    color: color.blue700,
  },
  cameraBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    backgroundColor: color.accent,
    borderWidth: 2,
    borderColor: color.offWhite,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityText: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  name: {
    fontSize: 21,
    fontWeight: type.weight.bold,
    letterSpacing: -0.3,
    color: color.ink,
  },
  identitySub: {
    fontSize: type.size.meta,
    fontWeight: type.weight.regular,
    color: color.slate500,
  },
  editBtn: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: color.borderStrong,
    backgroundColor: color.white,
  },
  editBtnText: {
    fontSize: type.size.meta,
    fontWeight: type.weight.bold,
    color: color.ink,
  },
  earningsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    padding: space.cardPad,
    borderRadius: radius.xl,
    backgroundColor: color.blue100,
  },
  earningsText: {
    flex: 1,
    gap: 4,
  },
  earningsLabel: {
    fontSize: type.size.label,
    fontWeight: type.weight.heavy,
    letterSpacing: type.tracking.label,
    color: color.blue700,
  },
  earningsAmount: {
    fontSize: 32,
    fontWeight: type.weight.heavy,
    letterSpacing: -0.8,
    color: color.ink,
  },
  earningsSub: {
    fontSize: type.size.meta,
    fontWeight: type.weight.regular,
    color: color.slate500,
  },
  earningsChevron: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: color.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  group: {
    gap: space[2],
  },
  groupLabel: {
    fontSize: type.size.label,
    fontWeight: type.weight.heavy,
    letterSpacing: type.tracking.label,
    textTransform: 'uppercase',
    color: color.slate400,
    marginLeft: 2,
  },
  groupCard: {
    backgroundColor: color.white,
    borderRadius: radius.lg,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    minHeight: 56,
    paddingVertical: space[3],
    paddingHorizontal: space[4],
  },
  rowBorder: {
    borderBottomWidth: borderWidth.hair,
    borderBottomColor: color.line,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rowLabel: {
    fontSize: type.size.bodySm,
    fontWeight: type.weight.semibold,
    color: color.ink,
  },
  rowSub: {
    fontSize: type.size.chip,
    fontWeight: type.weight.regular,
    color: color.slate500,
  },
  badge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 7,
    borderRadius: radius.pill,
    backgroundColor: color.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: type.size.label,
    fontWeight: type.weight.heavy,
    color: color.white,
  },
  connectedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 11,
    borderRadius: radius.pill,
    backgroundColor: color.greenSoft,
  },
  connectedDot: {
    width: 6,
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: color.green,
  },
  connectedText: {
    fontSize: type.size.chip,
    fontWeight: type.weight.bold,
    color: color.green,
  },
  connectBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: color.blue100,
  },
  connectBtnText: {
    fontSize: type.size.chip,
    fontWeight: type.weight.bold,
    color: color.blue700,
  },
  signOut: {
    alignSelf: 'center',
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: radius.pill,
  },
  signOutText: {
    fontSize: type.size.action,
    fontWeight: type.weight.bold,
    color: color.slate500,
  },
  footer: {
    textAlign: 'center',
    fontSize: type.size.label,
    fontWeight: type.weight.semibold,
    color: color.slate300,
    marginTop: -space[2],
  },
  popScrim: {
    ...StyleSheet.absoluteFillObject,
  },
  popover: {
    position: 'absolute',
    left: space.gutter,
    right: space.gutter + 40,
    borderRadius: radius.md,
    backgroundColor: color.white,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
    overflow: 'hidden',
  },
  popRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    paddingVertical: space[4],
    paddingHorizontal: space[4],
  },
  popRowBorder: {
    borderTopWidth: borderWidth.hair,
    borderTopColor: color.line,
  },
  popRowText: {
    flex: 1,
    minWidth: 0,
    fontSize: type.size.meta,
    fontWeight: type.weight.bold,
    color: color.ink,
  },
});
