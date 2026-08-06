import { StyleSheet, Text, View } from 'react-native';

import type { AccountApprovalItem } from '../../lib/creator-accounts-api';
import { formatAge } from '../../lib/admin-queue-map';
import { borderWidth, color, radiusAdmin, shadow, type } from '../../theme/tokens';
import { CreatorAvatar } from './shared';
import { Icon } from '../ui/Icon';
import { PressableScale } from '../ui/PressableScale';

export interface AccountRowProps {
  account: AccountApprovalItem;
  onPress: () => void;
}

/**
 * Admin handoff §2 account row — 40px avatar, name + status chip, both
 * handles, submitted time or the rejection reason.
 */
export function AccountRow({ account, onPress }: AccountRowProps) {
  const name = account.profiles?.full_name?.trim() || 'Creator';
  const sentBack = account.status === 'needs_changes';
  const tiktok = account.tiktok_handle ? `@${account.tiktok_handle}` : 'No TikTok handle';
  const instagram = account.instagram_handle
    ? `@${account.instagram_handle}`
    : 'No Instagram handle';

  return (
    <PressableScale
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.card, shadow.shadowCard]}
    >
      <CreatorAvatar uri={null} name={name} size={40} />
      <View style={styles.column}>
        <View style={styles.nameRow}>
          <Text numberOfLines={1} style={styles.name}>
            {name}
          </Text>
          <Text style={styles.chip}>{sentBack ? 'Needs changes' : 'Pending'}</Text>
        </View>
        <Text numberOfLines={1} style={styles.handles}>
          {`${tiktok} · ${instagram}`}
        </Text>
        <Text numberOfLines={1} style={sentBack && account.reason ? styles.reason : styles.meta}>
          {sentBack && account.reason
            ? account.reason
            : `Submitted ${formatAge(account.updated_at)}`}
        </Text>
      </View>
      <Icon name="chevron-right" size={18} color={color.slate300} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: radiusAdmin.lg,
    backgroundColor: color.white,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
  },
  column: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  name: {
    flexShrink: 1,
    fontSize: type.size.meta,
    fontWeight: type.weight.bold,
    letterSpacing: -0.2,
    color: color.ink,
  },
  chip: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.amberSoft,
    fontSize: type.size.micro11,
    fontWeight: type.weight.bold,
    color: color.amber,
    overflow: 'hidden',
  },
  handles: {
    fontSize: type.size.label,
    fontWeight: type.weight.semibold,
    color: color.slate500,
  },
  meta: {
    fontSize: type.size.label,
    fontWeight: type.weight.regular,
    color: color.slate400,
  },
  reason: {
    fontSize: type.size.label,
    fontWeight: type.weight.semibold,
    color: color.amber,
  },
});
