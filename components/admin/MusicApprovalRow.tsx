import { StyleSheet, Text, View } from 'react-native';

import type { MusicApprovalItem } from '../../lib/admin-api';
import { formatAge } from '../../lib/admin-queue-map';
import { borderWidth, color, radiusAdmin, shadow, type } from '../../theme/tokens';
import { PostThumb } from './shared';
import { Icon } from '../ui/Icon';
import { PressableScale } from '../ui/PressableScale';

export interface MusicApprovalRowProps {
  item: MusicApprovalItem;
  /** Green pill replaces the chevron once the song check is done. */
  approved?: boolean;
  onPress: () => void;
}

/**
 * Admin handoff §2 music row — one slideshow waiting for its song check.
 * No inline approve: the whole card opens the approval screen.
 */
export function MusicApprovalRow({ item, approved = false, onPress }: MusicApprovalRowProps) {
  const slideCount = item.slideCount ?? null;
  const postedAt = item.postedAt ?? null;
  const metaParts = [item.creatorName.split(' ')[0]];
  if (slideCount !== null) metaParts.push(`${slideCount} slides`);
  if (postedAt !== null) metaParts.push(`Live ${formatAge(postedAt)}`);

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`Open ${item.briefTitle} music approval`}
      onPress={onPress}
      style={[styles.card, shadow.shadowCard]}
    >
      <PostThumb uri={null} format="photo_carousel" width={44} height={58} />
      <View style={styles.column}>
        <Text style={styles.title}>{item.briefTitle}</Text>
        <Text numberOfLines={1} style={styles.meta}>
          {metaParts.join(' \u00b7 ')}
        </Text>
        <View style={styles.markedRow}>
          <Icon name="music-2" size={12} color={color.blue700} />
          <Text numberOfLines={1} style={styles.markedText}>
            {`Marked added ${formatAge(item.markedAt)}`}
          </Text>
        </View>
      </View>
      {approved ? (
        <View style={styles.approvedPill}>
          <Icon name="check" size={14} color={color.green} />
          <Text style={styles.approvedText}>Approved</Text>
        </View>
      ) : (
        <Icon name="chevron-right" size={18} color={color.slate300} />
      )}
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
  },
  title: {
    fontSize: type.size.meta,
    lineHeight: type.size.meta * 1.3,
    fontWeight: type.weight.bold,
    letterSpacing: -0.2,
    color: color.ink,
  },
  meta: {
    marginTop: 3,
    fontSize: type.size.label,
    fontWeight: type.weight.semibold,
    color: color.slate500,
  },
  markedRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  markedText: {
    flexShrink: 1,
    fontSize: type.size.micro11,
    fontWeight: type.weight.bold,
    color: color.blue700,
  },
  approvedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.greenSoft,
  },
  approvedText: {
    fontSize: type.size.chip,
    fontWeight: type.weight.bold,
    color: color.green,
  },
});
