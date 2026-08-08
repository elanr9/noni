import { Alert, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../lib/auth';
import type { StoredAccount } from '../lib/accounts';
import { borderWidth, color, radius, type } from '../theme/tokens';
import { Icon } from './ui/Icon';
import { PressableScale } from './ui/PressableScale';
import { SheetShell } from './ui/SheetShell';

function roleLabel(role: string): string {
  return role === 'admin' ? 'Admin' : 'Creator';
}

function AccountRow({
  account,
  active,
  onPress,
}: {
  account: StoredAccount;
  active: boolean;
  onPress: () => void;
}) {
  const name = account.fullName?.trim() || account.email || 'Account';
  const initial = name.charAt(0).toUpperCase();

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
          {name}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {roleLabel(account.role)}
          {account.email ? ` · ${account.email}` : ''}
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
  const { profile, accounts, switchAccount, addAccount } = useAuth();

  const hasCreator = accounts.some((a) => a.role === 'creator');
  const showBecomeCreator = profile?.role === 'admin' && !hasCreator;
  const addLabel = showBecomeCreator ? 'Become a creator' : 'Add account';

  async function onSwitch(userId: string) {
    if (userId === profile?.id) {
      onClose();
      return;
    }
    try {
      onClose();
      await switchAccount(userId);
    } catch (e) {
      Alert.alert(
        'Could not switch',
        e instanceof Error ? e.message : 'Try signing in again.',
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

  return (
    <SheetShell visible={visible} onClose={onClose}>
      <View style={styles.list}>
        {accounts.map((account) => (
          <AccountRow
            key={account.userId}
            account={account}
            active={account.userId === profile?.id}
            onPress={() => void onSwitch(account.userId)}
          />
        ))}
      </View>

      <PressableScale
        accessibilityRole="button"
        onPress={() => void onAdd()}
        style={styles.addRow}
      >
        <View style={styles.addIcon}>
          <Icon name="plus" size={20} color={color.ink} />
        </View>
        <Text style={styles.addLabel}>{addLabel}</Text>
      </PressableScale>
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
