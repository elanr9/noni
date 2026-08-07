import { useCallback, useMemo, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AreaChart } from '../../../components/creator/AreaChart';
import { MiniStat } from '../../../components/creator/MiniStat';
import { PostRow } from '../../../components/creator/PostRow';
import { SplitBar } from '../../../components/creator/SplitBar';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Segmented } from '../../../components/ui/Segmented';
import { SkeletonCard } from '../../../components/ui/Skeleton';
import { useAuth } from '../../../lib/auth';
import { formatCount } from '../../../lib/earnings';
import {
  listMyAssignments,
  parseAssignmentMetrics,
  type AssignmentWithBrief,
} from '../../../lib/tasks-api';
import { formatCents, listLedger, type WalletLedgerRow } from '../../../lib/wallet-api';
import { color, shadow } from '../../../theme/tokens';

const DAYS = 30;
const PLATFORMS = ['TikTok', 'Instagram'] as const;
const EARNING_KINDS = new Set(['bounty_credit', 'streak_bonus']);

type Platform = 'tiktok' | 'instagram';
type ChartMetric = 'views' | 'likes' | 'earned';

const METRIC_LABEL: Record<ChartMetric, string> = {
  views: 'Views',
  likes: 'Likes',
  earned: 'Earned',
};

function dayKey(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const dd = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${dd}`;
}

/** The keys of the last 30 days, oldest first, ending today. */
function lastDayKeys(): string[] {
  const keys: string[] = [];
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (DAYS - 1));
  for (let i = 0; i < DAYS; i += 1) {
    keys.push(dayKey(d));
    d.setDate(d.getDate() + 1);
  }
  return keys;
}

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

/** "2026-08-06" → "6 Aug". */
function formatDay(key: string): string {
  const [, m, d] = key.split('-').map(Number);
  return `${d} ${MONTHS[(m ?? 1) - 1]}`;
}

/**
 * The metrics poller rolls both platforms into one assignment, so the only
 * platform signal a creator row carries is the live post URL.
 */
function platformFromUrl(url: string | null): Platform | null {
  if (url === null) return null;
  const u = url.toLowerCase();
  if (u.includes('tiktok')) return 'tiktok';
  if (u.includes('instagram')) return 'instagram';
  return null;
}

type PostedRow = {
  assignment: AssignmentWithBrief;
  platform: Platform | null;
  views: number;
  likes: number;
};

export default function AnalyticsScreen() {
  const { profile } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [assignments, setAssignments] = useState<AssignmentWithBrief[]>([]);
  const [ledger, setLedger] = useState<WalletLedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [platformIndex, setPlatformIndex] = useState(0);
  const [metric, setMetric] = useState<ChartMetric>('views');

  const load = useCallback(async () => {
    if (!profile?.id) return;
    try {
      const [mine, rows] = await Promise.all([
        listMyAssignments(profile.id),
        // High cap instead of the default 50: Earned sums the whole ledger
        // and the wallet row carries no lifetime total to lean on.
        listLedger(profile.id, 1000),
      ]);
      setAssignments(mine);
      setLedger(rows);
    } catch {
      // Pull to refresh retries; keep whatever is on screen.
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [profile?.id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const posted = useMemo<PostedRow[]>(() => {
    return assignments
      .filter((a) => a.status === 'posted')
      .sort((a, b) =>
        a.scheduled_date === b.scheduled_date
          ? b.slot_index - a.slot_index
          : b.scheduled_date.localeCompare(a.scheduled_date),
      )
      .map((assignment) => {
        const metrics = parseAssignmentMetrics(assignment.metrics);
        return {
          assignment,
          platform: platformFromUrl(assignment.post_url),
          views: metrics.views ?? 0,
          likes: metrics.likes ?? 0,
        };
      });
  }, [assignments]);

  const totals = useMemo(() => {
    let views = 0;
    let likes = 0;
    for (const row of posted) {
      views += row.views;
      likes += row.likes;
    }
    let earnedCents = 0;
    for (const entry of ledger) {
      if (EARNING_KINDS.has(entry.kind)) earnedCents += entry.amount_cents;
    }
    return { views, likes, earnedCents };
  }, [posted, ledger]);

  // Daily buckets over the last 30 days. Views and likes attribute a post's
  // current numbers to its posting day; earnings bucket by ledger date.
  const series = useMemo(() => {
    const keys = lastDayKeys();
    const index = new Map(keys.map((k, i) => [k, i]));
    const views = keys.map(() => 0);
    const likes = keys.map(() => 0);
    const earned = keys.map(() => 0);
    for (const row of posted) {
      const i = index.get(row.assignment.scheduled_date);
      if (i === undefined) continue;
      views[i] += row.views;
      likes[i] += row.likes;
    }
    for (const entry of ledger) {
      if (!EARNING_KINDS.has(entry.kind) || entry.created_at === null) continue;
      const i = index.get(dayKey(new Date(entry.created_at)));
      if (i === undefined) continue;
      earned[i] += entry.amount_cents;
    }
    return { keys, views, likes, earned };
  }, [posted, ledger]);

  // Platform split from real attribution only. Assignments whose live URL
  // does not name a platform stay out of the split entirely.
  const split = useMemo(() => {
    let tiktok = 0;
    let instagram = 0;
    for (const row of posted) {
      if (row.platform === 'tiktok') tiktok += row.views;
      if (row.platform === 'instagram') instagram += row.views;
    }
    const total = tiktok + instagram;
    if (total === 0) return null;
    const tiktokPct = Math.round((tiktok / total) * 100);
    return { tiktokPct, instagramPct: 100 - tiktokPct };
  }, [posted]);

  const selectedPlatform: Platform = platformIndex === 0 ? 'tiktok' : 'instagram';
  // Metrics carry no per platform numbers, so the switch filters the list
  // only; posts with no platform signal show under both.
  const visiblePosts = useMemo(
    () =>
      posted.filter(
        (row) => row.platform === null || row.platform === selectedPlatform,
      ),
    [posted, selectedPlatform],
  );

  const chartSeries = series[metric];
  const chartTotal = chartSeries.reduce((sum, v) => sum + v, 0);
  const chartTotalLabel =
    metric === 'earned' ? formatCents(chartTotal) : formatCount(chartTotal);

  const openAssignment = (a: AssignmentWithBrief) => {
    router.push(`/(creator)/assignment/${a.id}`);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>Analytics</Text>
        <View style={styles.toggle}>
          <Segmented
            options={[...PLATFORMS]}
            value={platformIndex}
            onChange={setPlatformIndex}
          />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.column}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
          />
        }
      >
        {loading ? (
          <>
            <View style={styles.statsRow}>
              <SkeletonCard height={92} radius={16} style={styles.statSkeleton} />
              <SkeletonCard height={92} radius={16} style={styles.statSkeleton} />
              <SkeletonCard height={92} radius={16} style={styles.statSkeleton} />
            </View>
            <SkeletonCard height={196} radius={18} />
            <SkeletonCard height={96} radius={16} />
            <SkeletonCard height={96} radius={16} />
          </>
        ) : posted.length === 0 ? (
          <EmptyState
            icon="chart-column"
            title="No numbers yet"
            body="Your numbers show up after your first post goes live."
          />
        ) : (
          <>
            <View style={styles.statsRow}>
              <MiniStat
                label="Views"
                icon="eye"
                value={formatCount(totals.views)}
                delta=""
                series={series.views}
                onPress={() => setMetric('views')}
              />
              <MiniStat
                label="Likes"
                icon="zap"
                value={formatCount(totals.likes)}
                delta=""
                series={series.likes}
                onPress={() => setMetric('likes')}
              />
              <MiniStat
                label="Earned"
                icon="dollar-sign"
                value={formatCents(totals.earnedCents)}
                delta=""
                series={series.earned}
                onPress={() => setMetric('earned')}
              />
            </View>

            <View style={[styles.chartCard, shadow.shadowCard]}>
              <Text style={styles.chartLabel}>
                {METRIC_LABEL[metric]} · Last 30 days
              </Text>
              <Text style={styles.chartTotal}>{chartTotalLabel}</Text>
              <AreaChart key={metric} series={chartSeries} />
              <View style={styles.axisRow}>
                <Text style={styles.axisLabel}>{formatDay(series.keys[0])}</Text>
                <Text style={styles.axisLabel}>Today</Text>
              </View>
            </View>

            {split !== null && (
              <SplitBar
                range="Last 30 days"
                tiktokPct={split.tiktokPct}
                instagramPct={split.instagramPct}
              />
            )}

            <Text style={styles.sectionLabel}>Posts</Text>
            {visiblePosts.length === 0 ? (
              <EmptyState
                icon="chart-column"
                title={`Nothing on ${PLATFORMS[platformIndex]} yet`}
                body="Posts land here once they go live on this platform."
                compact
              />
            ) : (
              visiblePosts.map((row) => (
                <PostRow
                  key={row.assignment.id}
                  platform={row.platform}
                  time={formatDay(row.assignment.scheduled_date)}
                  title={row.assignment.briefs.title}
                  views={row.views}
                  likes={row.likes}
                  isPhoto={row.assignment.briefs.format === 'photo_carousel'}
                  onPress={() => openAssignment(row.assignment)}
                />
              ))
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: color.offWhite,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingTop: 6,
    paddingHorizontal: 24,
    paddingBottom: 10,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.5,
    color: color.ink,
  },
  toggle: {
    width: 196,
  },
  column: {
    paddingHorizontal: 24,
    paddingBottom: 110,
    gap: 12,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statSkeleton: {
    flex: 1,
  },
  chartCard: {
    backgroundColor: color.white,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: 18,
    padding: 16,
    gap: 6,
  },
  chartLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: color.slate500,
  },
  chartTotal: {
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: -1,
    color: color.ink,
  },
  axisRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  axisLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: color.slate400,
  },
  sectionLabel: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    color: color.slate500,
  },
});
