import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from './Screen';
import { StatusChip } from './StatusChip';
import { bountyLabel, recordTimeLabel } from '../lib/bounty';
import { type TaskStatus } from '../lib/tasks';
import type { TaskWithTrend } from '../lib/tasks-api';

function formatTab(format: string): string {
  return format === 'photo_carousel' ? 'Slideshow' : 'Video';
}

export function TaskCard({
  task,
  onPress,
  bountyText,
}: {
  task: TaskWithTrend;
  onPress: () => void;
  bountyText?: string;
}) {
  const cover = task.trend_items?.cover_url ?? null;
  const time = recordTimeLabel(task.estimated_seconds);
  const bounty = bountyText ?? bountyLabel();

  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.media}>
        {cover ? (
          <Image source={{ uri: cover }} style={styles.cover} resizeMode="cover" />
        ) : (
          <View style={[styles.cover, styles.coverFallback]}>
            <Text style={styles.fallbackText}>No preview</Text>
          </View>
        )}

        <View style={styles.tab}>
          <Text style={styles.tabText}>{formatTab(task.format)}</Text>
        </View>

        <View style={styles.playWrap} pointerEvents="none">
          <View style={styles.playCircle}>
            <View style={styles.playTriangle} />
          </View>
        </View>
      </View>

      <View style={styles.body}>
        <View style={styles.topRow}>
          <StatusChip status={task.status as TaskStatus} />
          {task.trend_items?.author_handle ? (
            <Text style={styles.inspiredBy} numberOfLines={1}>
              inspired by @{task.trend_items.author_handle}
            </Text>
          ) : null}
        </View>

        <Text style={styles.title}>{task.title}</Text>
        {task.brief ? (
          <Text style={styles.brief} numberOfLines={3}>
            {task.brief}
          </Text>
        ) : null}

        <View style={styles.footer}>
          {time ? <Text style={styles.metaStrong}>{time}</Text> : null}
          {time ? <Text style={styles.dot}>·</Text> : null}
          <Text style={styles.bounty}>{bounty}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E6E2DA',
    overflow: 'hidden',
    marginBottom: 14,
  },
  media: {
    width: '100%',
    aspectRatio: 4 / 3,
    backgroundColor: '#0B0B0F',
  },
  cover: { width: '100%', height: '100%' },
  coverFallback: { alignItems: 'center', justifyContent: 'center' },
  fallbackText: { color: '#8A8A93', fontSize: 14, fontWeight: '600' },
  tab: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: 'rgba(11,11,15,0.78)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  tabText: { color: '#fff', fontSize: 12, fontWeight: '700', letterSpacing: 0.3 },
  playWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playTriangle: {
    marginLeft: 4,
    width: 0,
    height: 0,
    borderTopWidth: 11,
    borderBottomWidth: 11,
    borderLeftWidth: 18,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: colors.ink,
  },
  body: { padding: 16, gap: 8 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  inspiredBy: { flex: 1, fontSize: 12, color: colors.muted, fontWeight: '600' },
  title: { fontSize: 19, fontWeight: '800', color: colors.ink, letterSpacing: -0.3 },
  brief: { fontSize: 15, lineHeight: 21, color: colors.muted },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  metaStrong: { fontSize: 14, fontWeight: '700', color: colors.ink },
  dot: { fontSize: 14, color: colors.muted },
  bounty: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.accent,
  },
});
