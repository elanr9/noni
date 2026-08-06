import { StyleSheet, Text, View } from 'react-native';

import { borderWidth, color, radiusAdmin, shadow, type } from '../../../theme/tokens';
import { CreatorAvatar } from '../shared';

export interface PerCreatorRowProps {
  name: string;
  avatarUri: string | null;
  /** e.g. "12 posts · 48.2k views" */
  meta: string;
  /** Formatted revenue, or a quiet placeholder while conversions have not synced. */
  revenue: string;
  revenuePending: boolean;
}

/** Admin handoff §11 — per-creator row: photo, posts · views, revenue. */
export function PerCreatorRow({
  name,
  avatarUri,
  meta,
  revenue,
  revenuePending,
}: PerCreatorRowProps) {
  return (
    <View style={[styles.row, shadow.shadowCard]}>
      <CreatorAvatar uri={avatarUri} name={name} size={36} />
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {meta}
        </Text>
      </View>
      <Text style={[styles.revenue, revenuePending && styles.revenuePending]}>
        {revenue}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 64,
    paddingHorizontal: 12,
    backgroundColor: color.white,
    borderRadius: radiusAdmin.lg,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
  },
  body: {
    flex: 1,
    gap: 1,
  },
  name: {
    fontSize: type.size.bodySm,
    fontWeight: '700',
    color: color.ink,
  },
  meta: {
    fontSize: type.size.label,
    fontWeight: '600',
    color: color.slate400,
  },
  revenue: {
    fontSize: type.size.bodySm,
    fontWeight: '700',
    letterSpacing: type.tracking.title,
    color: color.ink,
  },
  revenuePending: {
    fontWeight: '600',
    color: color.slate400,
  },
});
