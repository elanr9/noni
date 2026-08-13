// Briefs week summary pieces, shared by the Briefs calendar view and the
// week detail for published weeks: a lane summary card and the posts made
// list (BriefsScreen reference).
import { StyleSheet, Text, View } from 'react-native';

import type { WeekPostItem } from '../../lib/briefs-api';
import { color, radiusAdmin } from '../../theme/tokens';
import { Icon, type IconName } from '../ui/Icon';
import { SkeletonCard } from '../ui/Skeleton';
import { Card, SectionLabel, Thumb } from './shared';

export interface LaneSummaryCardProps {
  icon: IconName;
  label: string;
  done: number;
  target: number;
}

/** Read-only lane card: icon + label, big done/target, thin progress rail. */
export function LaneSummaryCard({ icon, label, done, target }: LaneSummaryCardProps) {
  const pct = target > 0 ? Math.min(100, Math.round((done / target) * 100)) : 0;
  return (
    <Card pad={12} style={styles.laneCard}>
      <View style={styles.laneHead}>
        <Icon name={icon} size={14} color={color.slate400} />
        <Text style={styles.laneLabel}>{label}</Text>
      </View>
      <Text style={styles.laneCount}>
        {done}
        <Text style={styles.laneTarget}>{` / ${target}`}</Text>
      </Text>
      <View style={styles.laneRail}>
        <View style={[styles.laneFill, { width: `${pct}%` }]} />
      </View>
    </Card>
  );
}

export interface PostsMadeListProps {
  posts: WeekPostItem[];
  loading: boolean;
  formatViews: (views: number) => string;
}

/** "Posts made this week": thumb, title, creator meta, views on the right. */
export function PostsMadeList({ posts, loading, formatViews }: PostsMadeListProps) {
  if (loading) {
    return (
      <View style={styles.stack}>
        <SkeletonCard height={72} />
        <SkeletonCard height={72} />
        <SkeletonCard height={72} />
      </View>
    );
  }
  if (posts.length === 0) {
    return <Text style={styles.nothing}>Nothing recorded yet.</Text>;
  }
  return (
    <View style={styles.stack}>
      <SectionLabel>Posts made this week</SectionLabel>
      {posts.map((it) => (
        <Card key={it.postId} pad={12} style={styles.postRow}>
          <Thumb format={it.format} width={38} height={50} radius={9} />
          <View style={styles.postBody}>
            <Text numberOfLines={1} style={styles.postTitle}>
              {it.title}
            </Text>
            <Text numberOfLines={1} style={styles.postMeta}>
              {`${it.creatorName} · ${it.format === 'video' ? 'Reel' : 'Slideshow'} · ${it.when}`}
            </Text>
          </View>
          <View style={styles.postViews}>
            <Text style={styles.viewsValue}>{formatViews(it.views)}</Text>
            <Text style={styles.viewsUnit}>views</Text>
          </View>
        </Card>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  laneCard: {
    flex: 1,
  },
  laneHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  laneLabel: {
    fontSize: 12.5,
    fontWeight: '700',
    color: color.slate500,
  },
  laneCount: {
    marginTop: 5,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.4,
    color: color.ink,
  },
  laneTarget: {
    fontSize: 14,
    fontWeight: '700',
    color: color.slate400,
  },
  laneRail: {
    marginTop: 7,
    height: 4,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.fillQuiet,
    overflow: 'hidden',
  },
  laneFill: {
    height: 4,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.blue500,
  },
  stack: {
    gap: 8,
  },
  nothing: {
    marginTop: 4,
    marginHorizontal: 2,
    fontSize: 13,
    fontWeight: '400',
    lineHeight: 13 * 1.45,
    color: color.slate400,
  },
  postRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  postBody: {
    flex: 1,
    minWidth: 0,
  },
  postTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    letterSpacing: -0.2,
    color: color.ink,
  },
  postMeta: {
    marginTop: 2,
    fontSize: 11.5,
    fontWeight: '600',
    color: color.slate400,
  },
  postViews: {
    alignItems: 'flex-end',
  },
  viewsValue: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.2,
    color: color.ink,
  },
  viewsUnit: {
    fontSize: 11,
    fontWeight: '600',
    color: color.slate400,
  },
});
