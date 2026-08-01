import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Alert, Image, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as WebBrowser from 'expo-web-browser';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { StatusChip } from '../../../components/StatusChip';
import { Button } from '../../../components/ui/Button';
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
import { color, shadow, space } from '../../../theme/tokens';

type AccountInfo = {
  connected: boolean;
  handle: string | null;
  followers: number | null;
};

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

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.group}>
      <Text style={styles.groupLabel}>{label}</Text>
      <View style={[styles.card, shadow.shadowCard]}>{children}</View>
    </View>
  );
}

function Row({
  icon,
  label,
  value,
  chevron = false,
  danger = false,
  last = false,
  onPress,
}: {
  icon: IconName;
  label: string;
  value?: string;
  chevron?: boolean;
  danger?: boolean;
  last?: boolean;
  onPress?: () => void;
}) {
  const fg = danger ? color.danger : undefined;
  const body = (
    <>
      <Icon name={icon} size={19} color={fg ?? color.slate400} />
      <Text style={[styles.rowLabel, styles.rowLabelFlex, fg !== undefined && { color: fg }]}>
        {label}
      </Text>
      {value !== undefined && <Text style={styles.rowValue}>{value}</Text>}
      {chevron && <Icon name="chevron-right" size={17} color={color.slate300} />}
    </>
  );
  const rowStyle = [styles.row, !last && styles.rowBorder];
  if (!onPress) return <View style={rowStyle}>{body}</View>;
  return (
    <PressableScale accessibilityRole="button" onPress={onPress} style={rowStyle}>
      {body}
    </PressableScale>
  );
}

function ConnectRow({
  icon,
  label,
  info,
  loading,
  busy,
  last = false,
  onConnect,
}: {
  icon: IconName;
  label: string;
  info: AccountInfo;
  loading: boolean;
  busy: boolean;
  last?: boolean;
  onConnect: () => void;
}) {
  return (
    <View style={[styles.connectRow, !last && styles.rowBorder]}>
      <Icon name={icon} size={19} color={color.slate400} />
      <View style={styles.connectText}>
        <Text style={styles.rowLabel}>{label}</Text>
        {loading ? (
          <SkeletonLine width={110} height={12} radius={6} style={styles.connectSubSkeleton} />
        ) : (
          <Text style={styles.connectSub}>{accountSub(info)}</Text>
        )}
      </View>
      {!loading &&
        (info.connected ? (
          <StatusChip status="approved" label="Connected" />
        ) : (
          <Button size="sm" variant="primary" disabled={busy} onPress={onConnect}>
            Connect
          </Button>
        ))}
    </View>
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
  const [walletLabel, setWalletLabel] = useState<string | null>(null);

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
      if (w.available_cents > 0) {
        setWalletLabel(`${formatCents(w.available_cents)} available`);
      } else if (w.pending_cents > 0) {
        setWalletLabel(`${formatCents(w.pending_cents)} pending`);
      } else {
        setWalletLabel('Empty');
      }
    } catch {
      setWalletLabel(null);
    }
  }, [profile?.id, profile?.company_id]);

  useFocusEffect(
    useCallback(() => {
      void loadStatus();
      void loadWallet();
    }, [loadStatus, loadWallet]),
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
      Alert.alert('Connect failed', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setConnectBusy(false);
    }
  }

  async function editAvatar() {
    if (!profile) return;
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

  function confirmDelete() {
    Alert.alert(
      'Delete account?',
      'This signs you out on this device. To fully delete your data, contact support.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => void signOut() },
      ],
    );
  }

  const accounts = status?.social_accounts ?? {};
  const instagram = parseAccount(accounts.instagram);
  const tiktok = parseAccount(accounts.tiktok);

  const name = profile?.full_name?.trim() || 'Creator';
  const initial = name.charAt(0).toUpperCase();
  const subParts: string[] = [];
  if (status?.profile) subParts.push(`@${status.profile.replace(/^@/, '')}`);
  if (companyName) subParts.push(companyName);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 6 }]}>
      <Text style={styles.title}>Profile</Text>

      <View style={styles.header}>
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
        ) : (
          <View style={styles.avatar}>
            <Text style={styles.avatarInitial}>{initial}</Text>
          </View>
        )}
        <View style={styles.headerText}>
          <Text style={styles.name}>{name}</Text>
          {subParts.length > 0 && (
            <Text style={styles.headerSub} numberOfLines={1}>
              {subParts.join(' · ')}
            </Text>
          )}
        </View>
        <Button size="sm" variant="outline" disabled={editBusy} onPress={() => void editAvatar()}>
          Edit
        </Button>
      </View>

      <Group label="Balance">
        <Row
          icon="dollar-sign"
          label="Wallet"
          value={walletLabel ?? undefined}
          chevron
          last
          onPress={() => router.push('/(creator)/balance' as Href)}
        />
      </Group>

      <Group label="Accounts">
        <ConnectRow
          icon="at-sign"
          label="Instagram"
          info={instagram}
          loading={statusLoading}
          busy={connectBusy}
          onConnect={() => void connect()}
        />
        <ConnectRow
          icon="music-2"
          label="TikTok"
          info={tiktok}
          loading={statusLoading}
          busy={connectBusy}
          last
          onConnect={() => void connect()}
        />
      </Group>

      <Group label="Settings">
        <Row icon="bell" label="Notifications" value="Tasks, review" chevron />
        <Row icon="clock" label="Posting windows" value="3 a day" chevron last />
      </Group>

      <Group label="Legal and support">
        <Row icon="message-circle" label="Contact support" chevron />
        <Row icon="circle-alert" label="Privacy and terms" chevron />
        <Row icon="log-out" label="Sign out" onPress={() => void signOut()} />
        <Row icon="trash-2" label="Delete account" danger last onPress={confirmDelete} />
      </Group>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: color.offWhite,
    paddingHorizontal: space.gutter,
    paddingBottom: 96,
  },
  title: {
    fontSize: 30,
    fontWeight: '700',
    letterSpacing: -0.5,
    color: color.ink,
  },
  header: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 58,
    height: 58,
    borderRadius: 999,
    backgroundColor: color.blue100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: 58,
    height: 58,
    borderRadius: 999,
  },
  avatarInitial: {
    fontSize: 22,
    fontWeight: '800',
    color: color.blue700,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
    color: color.ink,
  },
  headerSub: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '400',
    color: color.slate500,
  },
  group: {
    paddingTop: 18,
  },
  groupLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    color: color.slate500,
    marginBottom: 8,
  },
  card: {
    backgroundColor: color.white,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: 18,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: color.line,
  },
  rowLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: color.ink,
  },
  rowLabelFlex: {
    flex: 1,
  },
  rowValue: {
    maxWidth: 92,
    textAlign: 'right',
    fontSize: 13,
    fontWeight: '400',
    color: color.slate500,
  },
  connectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  connectText: {
    flex: 1,
    minWidth: 0,
  },
  connectSub: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '400',
    color: color.slate500,
  },
  connectSubSkeleton: {
    marginTop: 4,
  },
});
