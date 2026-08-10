import { Alert, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../lib/auth';
import type { StoredAccount } from '../lib/accounts';
import {
  profileCanCreate,
  profileIsAdmin,
  type AppMode,
} from '../lib/active-mode';
import { borderWidth, color, radius, type } from '../theme/tokens';
import { Icon } from './ui/Icon';
import { PressableScale } from './ui/PressableScale';
import { SheetShell } from './ui/SheetShell';

function roleLabel(role: string): string {
  return role === 'admin' ? 'Admin' : 'Creator';
}

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
      style={styles.row}
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
        <Icon name="circle-check-big" size={24} color={color.blue500} />
      ) : null}
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

  const isDual =
    !!profile && profileIsAdmin(profile) && profileCanCreate(profile);
  const showBecomeCreator =
    !!profile && profileIsAdmin(profile) && !profile.can_create;
  const displayName = profile?.full_name?.trim() || profile?.id || 'Account';
  const email = accounts.find((a) => a.userId === profile?.id)?.email ?? null;

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

  const otherAccounts = accounts.filter((a) => a.userId !== profile?.id);

  return (
    <SheetShell visible={visible} onClose={onClose}>
      <View style={styles.list}>
        {isDual ? (
          <>
            <AccountRow
              title={displayName}
              subtitle={`Admin${email ? ` · ${email}` : ''}`}
              active={activeMode === 'admin'}
              onPress={() => void onSwitchMode('admin')}
            />
            <AccountRow
              title={displayName}
              subtitle={`Creator${email ? ` · ${email}` : ''}`}
              active={activeMode === 'creator'}
              onPress={() => void onSwitchMode('creator')}
            />
          </>
        ) : profile ? (
          <AccountRow
            title={displayName}
            subtitle={`${roleLabel(profile.role)}${email ? ` · ${email}` : ''}`}
            active
            onPress={onClose}
          />
        ) : null}

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

      {showBecomeCreator ? (
        <PressableScale
          accessibilityRole="button"
          onPress={() => void onBecomeCreator()}
          style={styles.addRow}
        >
          <View style={styles.addIcon}>
            <Icon name="plus" size={20} color={color.ink} />
          </View>
          <Text style={styles.addLabel}>Become a creator</Text>
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
  list: {
    gap: 2,
    paddingTop: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 10,
    paddingHorizontal: 2,
  },
  avatar: {
    width: 56,
    height: 56,
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
    gap: 2,
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
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 12,
    paddingHorizontal: 2,
    marginTop: 4,
  },
  addIcon: {
    width: 56,
    height: 56,
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
