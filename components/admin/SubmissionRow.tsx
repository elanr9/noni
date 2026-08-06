import { StyleSheet, Text, View } from 'react-native';

import type { MockQueueItem } from '../../lib/admin-review-types';
import { borderWidth, color, radiusAdmin, shadow, type } from '../../theme/tokens';
import { CreatorAvatar, PostThumb } from './shared';
import { FormatPill } from '../ui/FormatPill';
import { PressableScale } from '../ui/PressableScale';

/** Admin handoff §2 — every row in the queue is the same height. */
const ROW_HEIGHT = 96;
const MEDIA_HEIGHT = 72;
const MEDIA_WIDTH = 54;

export interface SubmissionRowProps {
  item: MockQueueItem;
  /** submissions.version — a re-record creates a new submission with attempt + 1. */
  attempt: number;
  /** Reel first frame or slide 1. Gradient fallback when missing. */
  thumbUri: string | null;
  /** Clip/slide count derived from the brief (hook + points + outro). */
  unitCount: number | null;
  onPress: () => void;
}

/**
 * Admin handoff §2 submission row — fixed 96px (72 media + 12 vertical
 * padding). Conditional content (retakes, duration, slide count) lives on
 * the media so the body never grows a wrapping chip.
 */
export function SubmissionRow({ item, attempt, thumbUri, unitCount, onPress }: SubmissionRowProps) {
  const isReel = item.format === 'video';
  const mediaBadge = isReel
    ? item.lengthLabel.includes(':')
      ? item.lengthLabel
      : undefined
    : unitCount !== null
      ? `${unitCount} slides`
      : undefined;

  return (
    <PressableScale
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.card, shadow.shadowCard]}
    >
      <PostThumb
        uri={thumbUri}
        format={item.format}
        width={MEDIA_WIDTH}
        height={MEDIA_HEIGHT}
        badge={mediaBadge}
        takeBadge={attempt > 1 ? `Take ${attempt}` : undefined}
      />
      <View style={styles.column}>
        <View style={styles.creatorRow}>
          <CreatorAvatar uri={null} name={item.creator.name} size={20} />
          <Text numberOfLines={1} style={styles.creator}>
            {item.creator.name.split(' ')[0]}
          </Text>
          <Text style={styles.dot}>{'\u00b7'}</Text>
          <Text numberOfLines={1} style={styles.age}>
            {item.ageLabel}
          </Text>
        </View>
        <Text numberOfLines={2} style={styles.title}>
          {item.title}
        </Text>
        <View style={styles.chipRow}>
          <FormatPill format={item.format} />
          {unitCount !== null && (
            <Text numberOfLines={1} style={styles.countChip}>
              {`${unitCount} ${isReel ? 'clips' : 'slides'}`}
            </Text>
          )}
        </View>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    height: ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: (ROW_HEIGHT - MEDIA_HEIGHT) / 2,
    borderRadius: radiusAdmin.lg,
    backgroundColor: color.white,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
    overflow: 'hidden',
  },
  column: {
    flex: 1,
    minWidth: 0,
    height: MEDIA_HEIGHT,
    justifyContent: 'space-between',
  },
  creatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 20,
  },
  creator: {
    flexShrink: 1,
    fontSize: type.size.label,
    fontWeight: type.weight.bold,
    color: color.slate500,
  },
  dot: {
    fontSize: type.size.label,
    fontWeight: type.weight.regular,
    color: color.slate300,
  },
  age: {
    fontSize: type.size.label,
    fontWeight: type.weight.semibold,
    color: color.slate400,
  },
  title: {
    fontSize: type.size.chip,
    lineHeight: 15,
    fontWeight: type.weight.bold,
    letterSpacing: -0.2,
    color: color.ink,
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    overflow: 'hidden',
  },
  countChip: {
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.fillQuiet,
    fontSize: type.size.micro11,
    fontWeight: type.weight.bold,
    color: color.slate500,
    overflow: 'hidden',
  },
});
