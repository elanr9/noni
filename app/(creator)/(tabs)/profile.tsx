import {
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import {
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Constants from 'expo-constants';
import * as ImagePicker from 'expo-image-picker';
import * as WebBrowser from 'expo-web-browser';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CampaignPill, CompanyMark, WAIT_RED, WaitBadge } from '../../../components/shared';
import { Icon, type IconName } from '../../../components/ui/Icon';
import { PressableScale } from '../../../components/ui/PressableScale';
import { SkeletonLine } from '../../../components/ui/Skeleton';
import {
  getSocialConnectStatus,
  type SocialConnectStatus,
} from '../../../lib/admin-api';
import { modesForProfile } from '../../../lib/active-mode';
import { useAuth } from '../../../lib/auth';
import {
  fetchCreatorEarningsByCompany,
  type CreatorCompanyEarnings,
} from '../../../lib/companies-api';
import { useCompany } from '../../../lib/company-context';
import { saveCreatorBasics, uploadAvatar } from '../../../lib/onboarding';
import {
  formatHandle,
  parseSocialAccount,
  socialAccountSummary,
  type SocialAccountInfo,
} from '../../../lib/social-accounts';
import { contactSupport } from '../../../lib/support';
import { supabase } from '../../../lib/supabase';
import { formatCents } from '../../../lib/wallet-api';
import {
  borderWidth,
  color,
  radius,
  shadow,
  space,
  type,
} from '../../../theme/tokens';

const TERMS_URL = 'https://www.usenoni.app/terms';

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
  const { active, companies, summary, switchTo, switching } = useCompany();

  const [status, setStatus] = useState<SocialConnectStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [earnings, setEarnings] = useState<CreatorCompanyEarnings[]>([]);

  const loadStatus = useCallback(async () => {
    try {
      setStatus(await getSocialConnectStatus());
    } catch {
      setStatus(null);
    } finally {
      setStatusLoading(false);
    }
  }, []);

  const loadEarnings = useCallback(async () => {
    if (!profile?.id) return;
    try {
      setEarnings(await fetchCreatorEarningsByCompany());
    } catch {
      setEarnings([]);
    }
  }, [profile?.id, profile?.active_company_id]);

  useFocusEffect(
    useCallback(() => {
      void loadStatus();
      void loadEarnings();
    }, [loadStatus, loadEarnings]),
  );

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
      const path = await uploadAvatar(profile.active_company_id, profile.id, result.assets[0].uri);
      await saveCreatorBasics(profile.id, profile.full_name ?? '', path);
      await refreshProfile();
    } catch (e) {
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Try again');
    } finally {
      setAvatarBusy(false);
    }
  }

  async function switchToManager() {
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
  const instagram = parseSocialAccount(accounts.instagram);
  const tiktok = parseSocialAccount(accounts.tiktok);
  const bothConnected = instagram.connected && tiktok.connected;

  const name = profile.full_name?.trim() || 'Creator';
  const initial = name.charAt(0).toUpperCase();
  const publicHandle = instagram.handle ?? tiktok.handle;
  const handle = publicHandle !== null ? formatHandle(publicHandle) : null;
  const company = active?.name ?? 'Your company';
  const totalRow = earnings.find((e) => e.isTotal) ?? null;
  const earnedByCompany = new Map(
    earnings.filter((e) => e.companyId !== null).map((e) => [e.companyId as string, e.earnedCents]),
  );
  const campaignCount = companies.length;
  const canManage = modesForProfile(profile).includes('admin');
  const version = Constants.expoConfig?.version ?? '1.0.0';

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
        <CampaignPill />

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
            <Text style={styles.earningsLabel}>TOTAL EARNINGS, ALL CAMPAIGNS</Text>
            <Text style={styles.earningsAmount}>
              {formatCents(totalRow?.earnedCents ?? 0)}
            </Text>
            <Text style={styles.earningsSub}>
              {`${campaignCount} ${campaignCount === 1 ? 'campaign' : 'campaigns'} · payments coming soon`}
            </Text>
          </View>
          <View style={styles.earningsChevron}>
            <Icon name="chevron-right" size={18} color={color.ink} />
          </View>
        </PressableScale>

        <View style={styles.group}>
          <Text style={styles.groupLabel}>Your campaigns</Text>
          <GroupCard>
            {companies.map((c, i) => {
              const here = c.companyId === active?.companyId;
              const status = summary[c.companyId];
              const waiting = status?.waiting ?? 0;
              const roleLabel = c.role === 'creator' ? 'Creator' : 'Campaign manager';
              const line = status ? `${roleLabel} · ${status.line}` : roleLabel;
              return (
                <PressableScale
                  key={c.companyId}
                  accessibilityRole="button"
                  accessibilityLabel={here ? `${c.name}, current campaign` : `Switch to ${c.name}`}
                  disabled={here || switching}
                  onPress={() => void switchTo(c.companyId)}
                  style={[styles.row, i < companies.length - 1 && styles.rowBorder]}
                >
                  <CompanyMark
                    companyId={c.companyId}
                    name={c.name}
                    logoPath={c.logoPath}
                    size={40}
                  />
                  <View style={styles.rowText}>
                    <View style={styles.campaignTitleRow}>
                      <Text numberOfLines={1} style={styles.campaignName}>
                        {c.name}
                      </Text>
                      {here && (
                        <View style={styles.hereChip}>
                          <Text style={styles.hereChipText}>Here</Text>
                        </View>
                      )}
                    </View>
                    <Text
                      numberOfLines={1}
                      style={[styles.rowSub, waiting > 0 && styles.rowSubWaiting]}
                    >
                      {line}
                    </Text>
                  </View>
                  <View style={styles.campaignRight}>
                    <Text style={styles.campaignEarned}>
                      {formatCents(earnedByCompany.get(c.companyId) ?? 0)}
                    </Text>
                    <WaitBadge count={waiting} size={18} />
                  </View>
                </PressableScale>
              );
            })}
          </GroupCard>
        </View>

        <View style={styles.group}>
          <Text style={styles.groupLabel}>Your accounts</Text>
          <GroupCard>
            {(
              [
                { icon: 'instagram' as IconName, label: 'Instagram', info: instagram },
                { icon: 'music-2' as IconName, label: 'TikTok', info: tiktok },
              ] satisfies { icon: IconName; label: string; info: SocialAccountInfo }[]
            ).map((row) => (
              <View key={row.label} style={[styles.row, styles.rowBorder]}>
                <Icon
                  name={row.icon}
                  size={19}
                  color={row.info.connected ? color.green : color.slate500}
                />
                <View style={styles.rowText}>
                  <Text style={styles.rowLabel}>{row.label}</Text>
                  {statusLoading ? (
                    <SkeletonLine width={140} height={13} radius={6} />
                  ) : (
                    <Text numberOfLines={1} style={styles.rowSub}>
                      {socialAccountSummary(row.info)}
                    </Text>
                  )}
                </View>
                {!statusLoading && row.info.connected && (
                  <View style={styles.connectedChip}>
                    <View style={styles.connectedDot} />
                    <Text style={styles.connectedText}>Connected</Text>
                  </View>
                )}
              </View>
            ))}
            <Row
              icon="link"
              label={bothConnected ? 'Manage connections' : 'Connect accounts'}
              sub={
                bothConnected
                  ? 'Approved posts publish automatically'
                  : 'Link both so approved posts publish for you'
              }
              last
              onPress={() => router.push('/(creator)/setup/connect' as Href)}
            />
          </GroupCard>
        </View>

        <View style={styles.group}>
          <Text style={styles.groupLabel}>Setup</Text>
          <GroupCard>
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
  rowSubWaiting: {
    color: WAIT_RED,
  },
  campaignTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  campaignName: {
    flexShrink: 1,
    fontSize: 16,
    fontWeight: type.weight.bold,
    color: color.ink,
  },
  hereChip: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: radius.pill,
    backgroundColor: color.blue100,
  },
  hereChipText: {
    fontSize: 11,
    fontWeight: type.weight.bold,
    color: color.blue700,
  },
  campaignRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  campaignEarned: {
    fontSize: 15,
    fontWeight: type.weight.bold,
    color: color.green,
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
});
