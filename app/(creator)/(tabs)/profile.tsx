import { useCallback, useEffect, useState } from 'react';
import { Alert, Image, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as WebBrowser from 'expo-web-browser';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AccountSwitcherCaret } from '../../../components/AccountSwitcherCaret';
import {
  SoftToast,
  UnlinkedSocials,
} from '../../../components/states';
import { Icon, type IconName } from '../../../components/ui/Icon';
import { PressableScale } from '../../../components/ui/PressableScale';
import { SkeletonLine } from '../../../components/ui/Skeleton';
import {
  getSocialConnectStatus,
  getSocialConnectUrl,
  type SocialConnectStatus,
} from '../../../lib/admin-api';
import { useAuth } from '../../../lib/auth';
import { getCompany, saveCreatorBasics, uploadAvatar } from '../../../lib/onboarding';
import { supabase } from '../../../lib/supabase';
import { formatCents, getOrCreateWallet } from '../../../lib/wallet-api';
import {
  borderWidth,
  color,
  radius,
  shadow,
  space,
  type,
} from '../../../theme/tokens';

type AccountInfo = {
  connected: boolean;
  handle: string | null;
  followers: number | null;
};

function chatSeenKey(creatorId: string): string {
  return `noni.chat.seenAt.${creatorId}`;
}

async function unreadAdminCount(
  companyId: string,
  creatorId: string,
): Promise<number> {
  const seenAt = await AsyncStorage.getItem(chatSeenKey(creatorId));
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
    ? `${handle}, ${formatFollowers(info.followers)} followers`
    : handle;
}

function AccountRow({
  icon,
  label,
  info,
  loading,
  busy,
  onConnect,
}: {
  icon: IconName;
  label: string;
  info: AccountInfo;
  loading: boolean;
  busy: boolean;
  onConnect: () => void;
}) {
  return (
    <PressableScale
      accessibilityRole="button"
      disabled={info.connected || loading || busy}
      onPress={info.connected ? undefined : onConnect}
      style={styles.accountCard}
    >
      <View style={styles.iconBubble}>
        <Icon name={icon} size={18} color={color.blue600} />
      </View>
      <View style={styles.accountText}>
        <Text style={styles.rowTitle}>{label}</Text>
        {loading ? (
          <SkeletonLine width={140} height={14} radius={6} style={styles.subSkeleton} />
        ) : (
          <Text style={styles.rowSub} numberOfLines={1}>
            {accountSub(info)}
          </Text>
        )}
      </View>
      {!loading &&
        (info.connected ? (
          <Text style={styles.connected}>Connected</Text>
        ) : (
          <Text style={styles.connectCta}>Connect</Text>
        ))}
    </PressableScale>
  );
}

function NavRow({
  icon,
  label,
  sub,
  badge,
  onPress,
}: {
  icon: IconName;
  label: string;
  sub?: string;
  badge?: number;
  onPress: () => void;
}) {
  return (
    <PressableScale
      accessibilityRole="button"
      onPress={onPress}
      style={styles.navCard}
    >
      <View style={styles.iconBubble}>
        <Icon name={icon} size={18} color={color.blue600} />
      </View>
      <View style={styles.accountText}>
        <Text style={styles.rowTitle}>{label}</Text>
        {sub !== undefined ? (
          <Text style={styles.rowSub} numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
      </View>
      {badge !== undefined && badge > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge > 99 ? '99+' : String(badge)}</Text>
        </View>
      ) : (
        <Icon name="chevron-right" size={18} color={color.slate400} />
      )}
    </PressableScale>
  );
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profile, signOut, refreshProfile } = useAuth();

  const [status, setStatus] = useState<SocialConnectStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [connectBusy, setConnectBusy] = useState(false);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [editBusy, setEditBusy] = useState(false);
  const [availableCents, setAvailableCents] = useState<number | null>(null);
  const [unread, setUnread] = useState(0);
  const [toast, setToast] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      setStatus(await getSocialConnectStatus());
    } catch {
      setStatus(null);
      setToast('Could not load connected accounts. Pull to try again.');
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

  async function connect() {
    setConnectBusy(true);
    try {
      const url = await getSocialConnectUrl();
      await WebBrowser.openBrowserAsync(url);
      await loadStatus();
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Connect failed. Try again.');
    } finally {
      setConnectBusy(false);
    }
  }

  async function editAvatar() {
    if (!profile || editBusy) return;
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Camera needed', 'Noni needs the camera for your avatar selfie.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      cameraType: ImagePicker.CameraType.front,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (result.canceled || !result.assets[0]) return;
    setEditBusy(true);
    try {
      const path = await uploadAvatar(profile.company_id, profile.id, result.assets[0].uri);
      await saveCreatorBasics(profile.id, profile.full_name ?? '', path);
      await refreshProfile();
    } catch (e) {
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Try again');
    } finally {
      setEditBusy(false);
    }
  }

  function openSettings() {
    Alert.alert('Settings', 'Notifications and privacy', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void signOut() },
    ]);
  }

  const accounts = status?.social_accounts ?? {};
  const instagram = parseAccount(accounts.instagram);
  const tiktok = parseAccount(accounts.tiktok);

  const name = profile?.full_name?.trim() || 'Creator';
  const initial = name.charAt(0).toUpperCase();
  const handle = status?.profile
    ? `@${status.profile.replace(/^@/, '')}`
    : null;
  const missingSocials: Array<'tiktok' | 'instagram'> = [];
  if (!statusLoading && !tiktok.connected) missingSocials.push('tiktok');
  if (!statusLoading && !instagram.connected) missingSocials.push('instagram');

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <AccountSwitcherCaret name={name} style={styles.caret} />

      <View style={styles.header}>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Edit avatar"
          disabled={editBusy}
          onPress={() => void editAvatar()}
        >
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatar}>
              <Text style={styles.avatarInitial}>{initial}</Text>
            </View>
          )}
        </PressableScale>
        <View style={styles.headerText}>
          {handle !== null ? (
            <Text style={styles.handle} numberOfLines={1}>
              {handle}
            </Text>
          ) : null}
          {companyName !== null ? (
            <Text style={styles.company} numberOfLines={1}>
              Posting for {companyName}
            </Text>
          ) : null}
        </View>
      </View>

      <Text style={styles.sectionLabel}>Your accounts</Text>
      {missingSocials.length >= 2 ? (
        <UnlinkedSocials
          missing={missingSocials}
          onConnect={() => void connect()}
        />
      ) : (
        <View style={styles.stack}>
          <AccountRow
            icon="music-2"
            label="TikTok"
            info={tiktok}
            loading={statusLoading}
            busy={connectBusy}
            onConnect={() => void connect()}
          />
          <AccountRow
            icon="at-sign"
            label="Instagram"
            info={instagram}
            loading={statusLoading}
            busy={connectBusy}
            onConnect={() => void connect()}
          />
        </View>
      )}

      <PressableScale
        accessibilityRole="button"
        accessibilityLabel="Open balance"
        onPress={() => router.push('/(creator)/balance' as Href)}
        style={[styles.balanceCard, shadow.shadowAccent]}
      >
        <View style={styles.balanceText}>
          <Text style={styles.balanceLabel}>Available to cash out</Text>
          <Text style={styles.balanceValue}>
            {availableCents !== null ? formatCents(availableCents) : '$0.00'}
          </Text>
        </View>
        <Icon name="chevron-right" size={20} color={color.white} />
      </PressableScale>

      <View style={styles.stack}>
        <NavRow
          icon="message-circle"
          label="Messages"
          badge={unread}
          onPress={() => router.push('/(creator)/messages' as Href)}
        />
        <NavRow
          icon="settings"
          label="Account setup"
          sub="Name, bio and verification"
          onPress={() => router.push('/(creator)/account-setup' as Href)}
        />
        <NavRow
          icon="settings"
          label="Settings"
          sub="Notifications and privacy"
          onPress={openSettings}
        />
      </View>
      <SoftToast
        visible={toast !== null}
        message={toast ?? ''}
        tone="error"
        onHide={() => setToast(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: color.offWhite,
    paddingHorizontal: space.gutter,
    paddingBottom: 96,
    gap: space[5],
  },
  caret: {
    marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[5],
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    backgroundColor: color.blue100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
  },
  avatarInitial: {
    fontSize: 28,
    fontWeight: type.weight.heavy,
    color: color.blue700,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  handle: {
    fontSize: type.size.bodySm,
    fontWeight: type.weight.regular,
    color: color.slate500,
  },
  company: {
    fontSize: type.size.chip,
    fontWeight: type.weight.regular,
    color: color.slate400,
  },
  sectionLabel: {
    fontSize: type.size.label,
    fontWeight: type.weight.heavy,
    letterSpacing: type.tracking.label,
    textTransform: 'uppercase',
    color: color.slate400,
    marginBottom: -4,
  },
  stack: {
    gap: 10,
  },
  accountCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: space[5],
    paddingHorizontal: space.cardPad,
    borderRadius: radius.lg,
    backgroundColor: color.white,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
  },
  navCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: space[5],
    paddingHorizontal: space.cardPad,
    borderRadius: radius.lg,
    backgroundColor: color.white,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
  },
  iconBubble: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: color.blue100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountText: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  rowTitle: {
    fontSize: type.size.body,
    fontWeight: type.weight.bold,
    color: color.ink,
  },
  rowSub: {
    fontSize: type.size.chip,
    fontWeight: type.weight.regular,
    color: color.slate500,
  },
  subSkeleton: {
    marginTop: 2,
  },
  connected: {
    fontSize: type.size.chip,
    fontWeight: type.weight.bold,
    color: color.green,
  },
  connectCta: {
    fontSize: type.size.chip,
    fontWeight: type.weight.bold,
    color: color.accent,
  },
  balanceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: space.cardPad,
    borderRadius: radius.lg,
    backgroundColor: color.blue500,
  },
  balanceText: {
    flex: 1,
    gap: 2,
  },
  balanceLabel: {
    fontSize: type.size.chip,
    fontWeight: type.weight.bold,
    color: 'rgba(255,255,255,0.8)',
  },
  balanceValue: {
    fontSize: 30,
    fontWeight: type.weight.heavy,
    letterSpacing: -0.8,
    color: color.white,
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
});
