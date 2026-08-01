import { StyleSheet, Text, View } from 'react-native';

import type { TaskWithTrend } from '../../lib/tasks-api';
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

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export interface PostCardProps {
  task: TaskWithTrend;
  /** Post views string, when known (e.g. "41k views"). */
  viewsLabel?: string;
  /** Swap is offered on today's assigned posts only. */
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
  task,
  viewsLabel,
  showSwap,
  onOpen,
  onRecord,
  onSwap,
}: PostCardProps) {
  const slideshow = task.format === 'photo_carousel';
  const todo = task.status === 'assigned' || task.status === 'changes_requested';
  const pending = task.status === 'submitted' || task.status === 'recorded';
  const done = task.status === 'posted' || task.status === 'approved';

  return (
    <MediaCard
      variant="hero"
      fill
      title={task.title}
      format={task.format === 'video' ? 'reel' : 'slideshow'}
      thumbnail={task.trend_items?.cover_url ?? undefined}
      duration={
        !slideshow && task.estimated_seconds !== null
          ? formatDuration(task.estimated_seconds)
          : undefined
      }
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
