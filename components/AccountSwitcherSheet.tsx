import { Alert, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../lib/auth';
import type { StoredAccount } from '../lib/accounts';
import {
  profileCanCreate,
  profileIsCampaignManager,
  profileIsPlatformAdmin,
  type AppMode,
} from '../lib/active-mode';
import { borderWidth, color, radius, type } from '../theme/tokens';
import { Icon, type IconName } from './ui/Icon';
import { PressableScale } from './ui/PressableScale';
import { SheetShell } from './ui/SheetShell';

function roleLabel(role: string): string {
  if (role === 'campaign_manager') return 'Campaign manager';
  if (role === 'admin') return 'Noni platform';
  return 'Creator';
}

const MODE_COPY: Record<
  AppMode,
  { title: string; body: string; icon: IconName }
> = {
  admin: {
    title: 'Campaign manager',
    body: 'Review posts, run briefs, and manage creators.',
    icon: 'users',
  },
  creator: {
    title: 'Creator',
    body: 'Record, post, and cash out.',
    icon: 'circle-user-round',
  },
  platform: {
    title: 'Noni platform',
    body: 'Ops lives on the website.',
    icon: 'settings',
  },
};

function AccountRow({
  title,
  subtitle,
  active,
  onPress,
}: {
  title: string;
  subtitle: string;
  active: boolean;
  onPress: () => void;
}) {
  const initial = title.charAt(0).toUpperCase();

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={styles.accountRow}
    >
      <View style={styles.avatar}>
        <Text style={styles.avatarInitial}>{initial}</Text>
      </View>
      <View style={styles.meta}>
        <Text style={styles.name} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      {active ? (
        <Icon name="circle-check-big" size={22} color={color.blue500} />
      ) : (
        <Icon name="chevron-right" size={18} color={color.slate300} />
      )}
    </PressableScale>
  );
}

function RoleCard({
  mode,
  active,
  onPress,
}: {
  mode: AppMode;
  active: boolean;
  onPress: () => void;
}) {
  const copy = MODE_COPY[mode];
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={active ? `${copy.title}, using` : `Switch to ${copy.title}`}
      onPress={onPress}
      style={[styles.roleCard, active && styles.roleCardActive]}
    >
      <View style={styles.roleIcon}>
        <Icon
          name={copy.icon}
          size={18}
          color={active ? color.blue700 : color.slate500}
        />
      </View>
      <View style={styles.meta}>
        <Text style={styles.roleTitle}>{copy.title}</Text>
        <Text style={styles.roleBody}>{copy.body}</Text>
      </View>
      {active ? (
        <View style={styles.usingPill}>
          <Text style={styles.usingText}>Using</Text>
        </View>
      ) : (
        <Icon name="arrow-right" size={18} color={color.slate400} />
      )}
    </PressableScale>
  );
}

export function AccountSwitcherSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const {
    profile,
    accounts,
    activeMode,
    switchAccount,
    addAccount,
    setActiveMode,
    enableCreatorMode,
  } = useAuth();

  const isPlatform = !!profile && profileIsPlatformAdmin(profile);
  const isDual =
    !!profile && profileIsCampaignManager(profile) && profileCanCreate(profile);
  const showModes = isPlatform || isDual;
  const showBecomeCreator =
    !!profile && profileIsCampaignManager(profile) && !profile.can_create;
  const displayName = profile?.full_name?.trim() || profile?.id || 'Account';
  const email = accounts.find((a) => a.userId === profile?.id)?.email ?? null;
  const otherAccounts = accounts.filter((a) => a.userId !== profile?.id);

  const modes: AppMode[] = isPlatform
    ? ['platform', 'admin', 'creator']
    : ['admin', 'creator'];

  async function onSwitchMode(mode: AppMode) {
    if (mode === activeMode) {
      onClose();
      return;
    }
    try {
      onClose();
      await setActiveMode(mode);
    } catch (e) {
      Alert.alert(
        'Could not switch',
        e instanceof Error ? e.message : 'Try again.',
      );
    }
  }

  async function onSwitch(account: StoredAccount) {
    if (account.userId === profile?.id) {
      onClose();
      return;
    }
    try {
      onClose();
      await switchAccount(account.userId);
    } catch (e) {
      Alert.alert(
        'Could not switch',
        e instanceof Error ? e.message : 'Try signing in again.',
        /sign in again/i.test(e instanceof Error ? e.message : '')
          ? [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Sign in',
                onPress: () => {
                  void addAccount();
                },
              },
            ]
          : undefined,
      );
    }
  }

  async function onBecomeCreator() {
    try {
      onClose();
      await enableCreatorMode();
    } catch (e) {
      Alert.alert(
        'Could not continue',
        e instanceof Error ? e.message : 'Try again.',
      );
    }
  }

  async function onAdd() {
    try {
      onClose();
      await addAccount();
    } catch (e) {
      Alert.alert(
        'Could not continue',
        e instanceof Error ? e.message : 'Try again.',
      );
    }
  }

  const subtitle = showModes
    ? 'Same email, two sides of Noni. Pick campaign manager or creator.'
    : showBecomeCreator
      ? 'Turn on creator mode on this email, or sign in as someone else.'
      : 'Use another Google account signed in on this phone.';

  return (
    <SheetShell visible={visible} onClose={onClose}>
      <Text style={styles.title}>Switch account</Text>
      <Text style={styles.lede}>{subtitle}</Text>

      {showModes ? (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>This email</Text>
          {email !== null ? (
            <Text style={styles.sectionHint} numberOfLines={1}>
              {displayName}
              {' · '}
              {email}
            </Text>
          ) : null}
          <View style={styles.roleStack}>
            {modes.map((mode) => (
              <RoleCard
                key={mode}
                mode={mode}
                active={activeMode === mode}
                onPress={() => void onSwitchMode(mode)}
              />
            ))}
          </View>
        </View>
      ) : profile ? (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Signed in</Text>
          <AccountRow
            title={displayName}
            subtitle={`${roleLabel(profile.role)}${email ? ` · ${email}` : ''}`}
            active
            onPress={onClose}
          />
        </View>
      ) : null}

      {otherAccounts.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Other accounts</Text>
          {otherAccounts.map((account) => (
            <AccountRow
              key={account.userId}
              title={account.fullName?.trim() || account.email || 'Account'}
              subtitle={`${roleLabel(account.role)}${
                account.email ? ` · ${account.email}` : ''
              }`}
              active={false}
              onPress={() => void onSwitch(account)}
            />
          ))}
        </View>
      ) : null}

      {showBecomeCreator ? (
        <PressableScale
          accessibilityRole="button"
          onPress={() => void onBecomeCreator()}
          style={styles.ctaCard}
        >
          <View style={styles.roleIcon}>
            <Icon name="sparkles" size={18} color={color.blue700} />
          </View>
          <View style={styles.meta}>
            <Text style={styles.roleTitle}>Become a creator</Text>
            <Text style={styles.roleBody}>
              Record and post on this email without signing in again.
            </Text>
          </View>
          <Icon name="arrow-right" size={18} color={color.slate400} />
        </PressableScale>
      ) : (
        <PressableScale
          accessibilityRole="button"
          onPress={() => void onAdd()}
          style={styles.addRow}
        >
          <View style={styles.addIcon}>
            <Icon name="plus" size={20} color={color.ink} />
          </View>
          <Text style={styles.addLabel}>Add account</Text>
        </PressableScale>
      )}
    </SheetShell>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: type.size.cardLg,
    fontWeight: '800',
    letterSpacing: -0.3,
    color: color.ink,
  },
  lede: {
    marginTop: 8,
    marginBottom: 18,
    fontSize: type.size.meta,
    lineHeight: type.size.meta * 1.45,
    color: color.slate500,
  },
  section: {
    marginBottom: 18,
  },
  sectionLabel: {
    fontSize: type.size.label,
    fontWeight: '700',
    letterSpacing: type.tracking.label,
    textTransform: 'uppercase',
    color: color.slate400,
  },
  sectionHint: {
    marginTop: 4,
    marginBottom: 10,
    fontSize: type.size.chip,
    fontWeight: '500',
    color: color.slate500,
  },
  roleStack: {
    gap: 8,
    marginTop: 10,
  },
  roleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: radius.lg,
    backgroundColor: color.fillQuiet,
  },
  roleCardActive: {
    backgroundColor: color.blue100,
  },
  roleIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: color.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleTitle: {
    fontSize: type.size.bodySm,
    fontWeight: '700',
    color: color.ink,
  },
  roleBody: {
    marginTop: 2,
    fontSize: type.size.chip,
    lineHeight: type.size.chip * 1.35,
    color: color.slate500,
  },
  usingPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: color.white,
  },
  usingText: {
    fontSize: type.size.micro11,
    fontWeight: '700',
    color: color.blue700,
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 10,
    paddingHorizontal: 2,
    marginTop: 6,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: color.fillQuiet,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: type.size.body,
    fontWeight: '800',
    color: color.ink,
  },
  meta: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: type.size.body,
    fontWeight: '700',
    color: color.ink,
  },
  sub: {
    fontSize: type.size.chip,
    fontWeight: '500',
    color: color.slate500,
  },
  ctaCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: radius.lg,
    backgroundColor: color.blue100,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 12,
    paddingHorizontal: 2,
  },
  addIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    borderWidth: borderWidth.hair,
    borderColor: color.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addLabel: {
    flex: 1,
    fontSize: type.size.body,
    fontWeight: '600',
    color: color.ink,
  },
});
