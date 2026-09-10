import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { PostNote, PostSummary } from '../../../lib/post-event-labels';
import { borderWidth, color, radiusAdmin, shadow } from '../../../theme/tokens';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { usePostThumb } from '../creator/useVideoThumb';
import { Thumb } from '../shared';
import { NoteRows, PostEventPill, type PostEventCardKind } from './PostEventPill';

export type PostCardProps = {
  summary: PostSummary;
  kind: PostEventCardKind;
  label: string;
  notes?: PostNote[];
  waiting?: boolean;
  compact?: boolean;
  onOpen: () => void;
  onReview?: () => void;
};

/** Handoff 2.5: a post travelling through a conversation. */
export function PostCard({
  summary,
  kind,
  label,
  notes,
  waiting = false,
  compact = false,
  onOpen,
  onReview,
}: PostCardProps) {
  const thumb = usePostThumb(summary.mediaPath, summary.format);
  return (
    <View style={[styles.card, shadow.shadowCard]}>
      <Pressable accessibilityRole="button" onPress={onOpen} style={styles.top}>
        <Thumb
          uri={thumb}
          format={summary.format}
          width={40}
          height={54}
          radius={radiusAdmin.sm}
          takeBadge={summary.attempt > 1 ? `Take ${summary.attempt}` : undefined}
        />
        <View style={styles.text}>
          <Text numberOfLines={1} style={styles.title}>
            {summary.title}
          </Text>
          <View style={styles.pillWrap}>
            <PostEventPill kind={kind} label={label} size="card" />
          </View>
        </View>
        <Icon name="chevron-right" size={16} color={color.slate300} />
      </Pressable>
      {notes !== undefined && notes.length > 0 && (
        <View style={styles.notes}>
          <NoteRows notes={notes} variant="card" />
        </View>
      )}
      {waiting && !compact && (
        <View style={styles.review}>
          <Button size="sm" variant="primary" icon="eye" block onPress={onReview}>
            Review now
          </Button>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 6,
    maxWidth: 320,
    backgroundColor: color.white,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
    borderRadius: radiusAdmin.md,
    overflow: 'hidden',
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
  },
  text: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 13.5,
    lineHeight: 13.5 * 1.3,
    fontWeight: '700',
    letterSpacing: -0.2,
    color: color.ink,
  },
  pillWrap: {
    marginTop: 4,
    flexDirection: 'row',
  },
  notes: {
    marginHorizontal: 10,
    marginBottom: 10,
  },
  review: {
    paddingHorizontal: 10,
    paddingBottom: 10,
  },
});
