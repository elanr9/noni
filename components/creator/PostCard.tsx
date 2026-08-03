import { StyleSheet, Text, View } from 'react-native';

import type { AssignmentWithBrief } from '../../lib/tasks-api';
import { color } from '../../theme/tokens';
import { Button } from '../ui/Button';
import { Icon, type IconName } from '../ui/Icon';
import { MediaCard } from '../ui/MediaCard';

/** §6.6 number formatting, k/M branches. */
export function formatViews(views: number): string {
  if (views >= 1_000_000) return `${(views / 1e6).toFixed(views >= 1e7 ? 0 : 1)}M`;
  if (views >= 1000) return `${(views / 1000).toFixed(views >= 10000 ? 0 : 1)}k`;
  return `${views}`;
}

export interface PostCardProps {
  assignment: AssignmentWithBrief;
  /** Post views string, when known (e.g. "41k views"). */
  viewsLabel?: string;
  /** Swap is offered on untouched posts with a spare pool behind them. */
  showSwap: boolean;
  onOpen: () => void;
  onRecord: () => void;
  onSwap: () => void;
}

function StatusPill({
  icon,
  label,
  fg,
  bg,
}: {
  icon: IconName;
  label: string;
  fg: string;
  bg: string;
}) {
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Icon name={icon} size={14} color={fg} />
      <Text style={[styles.pillText, { color: fg }]}>{label}</Text>
    </View>
  );
}

export function PostCard({
  assignment,
  viewsLabel,
  showSwap,
  onOpen,
  onRecord,
  onSwap,
}: PostCardProps) {
  const brief = assignment.briefs;
  const slideshow = brief.format === 'photo_carousel';
  const todo =
    assignment.status === 'assigned' || assignment.status === 'changes_requested';
  const pending =
    assignment.status === 'submitted' || assignment.status === 'recorded';
  const done =
    assignment.status === 'posted' || assignment.status === 'approved';

  return (
    <MediaCard
      variant="hero"
      fill
      title={brief.title}
      meta={brief.hook ?? undefined}
      format={slideshow ? 'slideshow' : 'reel'}
      onPress={onOpen}
    >
      {todo && (
        <View style={styles.footerRow}>
          <Button
            variant="primary"
            size="md"
            icon={slideshow ? 'images' : 'video'}
            onPress={onRecord}
            style={styles.grow}
          >
            {slideshow ? 'Create' : 'Record'}
          </Button>
          {showSwap && (
            <Button variant="tint" size="md" icon="rotate-ccw" onPress={onSwap}>
              Swap
            </Button>
          )}
        </View>
      )}

      {pending && (
        <View style={styles.footerRow}>
          <StatusPill icon="clock" label="In review" fg={color.amber} bg={color.amberSoft} />
          <Text style={styles.footerNote} numberOfLines={1}>
            Sent for approval
          </Text>
          <Button variant="ghost" size="sm" onPress={onOpen}>
            See it
          </Button>
        </View>
      )}

      {done && (
        <View style={styles.footerRow}>
          <StatusPill
            icon="circle-check-big"
            label="Posted"
            fg={color.green}
            bg={color.greenSoft}
          />
          <Text style={styles.footerNote} numberOfLines={1}>
            {viewsLabel ?? ''}
          </Text>
          <Button variant="ghost" size="sm" onPress={onOpen}>
            See it
          </Button>
        </View>
      )}
    </MediaCard>
  );
}

const styles = StyleSheet.create({
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  grow: {
    flex: 1,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
  },
  pillText: {
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 13,
  },
  footerNote: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: color.slate500,
  },
});
