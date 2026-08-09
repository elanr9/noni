import { useCallback, useMemo, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { AreaChart } from '../../../components/creator/AreaChart';
import { Screen } from '../../../components/layout/Screen';
import { AnalyticsSkeleton, SoftToast } from '../../../components/states';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Icon } from '../../../components/ui/Icon';
import { PressableScale } from '../../../components/ui/PressableScale';
import { Segmented } from '../../../components/ui/Segmented';
import { StatCard } from '../../../components/ui/StatCard';
import { useAuth } from '../../../lib/auth';
import { formatCount } from '../../../lib/earnings';
import {
  listMyAssignments,
  parseAssignmentMetrics,
  type AssignmentWithBrief,
} from '../../../lib/tasks-api';
import { formatCents, listLedger, type WalletLedgerRow } from '../../../lib/wallet-api';
import { borderWidth, color, radius, space, type } from '../../../theme/tokens';

const DAYS = 30;
const PLATFORMS = ['TikTok', 'Instagram'] as const;
const EARNING_KINDS = new Set(['bounty_credit', 'streak_bonus']);

/** Design sample traffic mix until metrics carry source attribution. */
const SOURCE_MIX = [
  { key: 'fyp', label: 'For You', pct: 62, color: color.blue500 },
  { key: 'search', label: 'Search', pct: 21, color: color.blue300 },
  { key: 'profile', label: 'Profile', pct: 17, color: color.lineStrong },
] as const;

type Platform = 'tiktok' | 'instagram';
type ChartMetric = 'views' | 'likes';

function dayKey(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const dd = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${dd}`;
}

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

function platformFromUrl(url: string | null): Platform | null {
  if (url === null) return null;
  const u = url.toLowerCase();
  if (u.includes('tiktok')) return 'tiktok';
  if (u.includes('instagram')) return 'instagram';
  return null;
}

function earnedDollarsLabel(cents: number): string {
  return formatCents(cents).replace(/\.00$/, '');
}

type PostedRow = {
  assignment: AssignmentWithBrief;
  platform: Platform | null;
  views: number;
  likes: number;
  earnedCents: number;
};

export default function AnalyticsScreen() {
  const { profile } = useAuth();
  const router = useRouter();

  const [assignments, setAssignments] = useState<AssignmentWithBrief[]>([]);
  const [ledger, setLedger] = useState<WalletLedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [platformIndex, setPlatformIndex] = useState(0);
  const [metric, setMetric] = useState<ChartMetric>('views');
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile?.id) return;
    try {
      const [mine, rows] = await Promise.all([
        listMyAssignments(profile.id),
        listLedger(profile.id, 1000),
      ]);
      setAssignments(mine);
      setLedger(rows);
    } catch {
      setToast('Could not refresh Analytics. Pull to try again.');
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
          earnedCents: metrics.revenue_cents ?? 0,
        };
      });
  }, [assignments]);

  const selectedPlatform: Platform = platformIndex === 0 ? 'tiktok' : 'instagram';

  const filtered = useMemo(
    () =>
      posted.filter(
        (row) => row.platform === null || row.platform === selectedPlatform,
      ),
    [posted, selectedPlatform],
  );

  const earned30Cents = useMemo(() => {
    const cutoff = new Date();
    cutoff.setHours(0, 0, 0, 0);
    cutoff.setDate(cutoff.getDate() - (DAYS - 1));
    let sum = 0;
    for (const entry of ledger) {
      if (!EARNING_KINDS.has(entry.kind) || entry.created_at === null) continue;
      if (new Date(entry.created_at) < cutoff) continue;
      sum += entry.amount_cents;
    }
    return sum;
  }, [ledger]);

  const totals = useMemo(() => {
    let views = 0;
    let likes = 0;
    for (const row of filtered) {
      views += row.views;
      likes += row.likes;
    }
    return { views, likes };
  }, [filtered]);

  const series = useMemo(() => {
    const keys = lastDayKeys();
    const index = new Map(keys.map((k, i) => [k, i]));
    const views = keys.map(() => 0);
    const likes = keys.map(() => 0);
    for (const row of filtered) {
      const i = index.get(row.assignment.scheduled_date);
      if (i === undefined) continue;
      views[i] += row.views;
      likes[i] += row.likes;
    }
    return { keys, views, likes };
  }, [filtered]);

  const topPosts = useMemo(
    () => [...filtered].sort((a, b) => b.views - a.views).slice(0, 5),
    [filtered],
  );

  const chartSeries = series[metric];
  const chartLabel =
    metric === 'views' ? 'Views, last 30 days' : 'Likes, last 30 days';

  const openPosted = (a: AssignmentWithBrief) => {
    router.push(`/(creator)/posts/${a.id}` as Href);
  };

  return (
    <Screen scroll={false} bg={color.white} contentStyle={styles.screenContent}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Analytics</Text>
        <View style={styles.earnedBlock}>
          <Text style={styles.earnedValue}>
            {earnedDollarsLabel(earned30Cents)}
          </Text>
          <Text style={styles.earnedLabel}>earned, 30 days</Text>
        </View>
      </View>

      <Segmented
        options={[...PLATFORMS]}
        value={platformIndex}
        onChange={setPlatformIndex}
      />

      <ScrollView
        style={styles.flex}
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
          <AnalyticsSkeleton />
        ) : posted.length === 0 ? (
          <EmptyState
            icon="chart-column"
            title="No numbers yet"
            body="Record and post from Home to unlock your numbers."
          />
        ) : (
          <>
            <View style={styles.statsRow}>
              <StatCard
                label="Views"
                value={formatCount(totals.views)}
                selected={metric === 'views'}
                onPress={() => setMetric('views')}
              />
              <StatCard
                label="Likes"
                value={formatCount(totals.likes)}
                selected={metric === 'likes'}
                onPress={() => setMetric('likes')}
              />
            </View>

            <View style={styles.chartBlock}>
              <Text style={styles.sectionLabel}>{chartLabel}</Text>
              <AreaChart
                key={`${selectedPlatform}-${metric}`}
                series={chartSeries}
              />
            </View>

            <View style={styles.sourceBlock}>
              <Text style={styles.sectionLabel}>Where views came from</Text>
              <View style={styles.sourceBar}>
                {SOURCE_MIX.map((s) => (
                  <View
                    key={s.key}
                    style={[
                      styles.sourceSeg,
                      { flex: s.pct, backgroundColor: s.color },
                    ]}
                  />
                ))}
              </View>
              <View style={styles.legend}>
                {SOURCE_MIX.map((s) => (
                  <View key={s.key} style={styles.legendItem}>
                    <View
                      style={[styles.legendDot, { backgroundColor: s.color }]}
                    />
                    <Text style={styles.legendText}>
                      {`${s.label} ${s.pct}%`}
                    </Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.topBlock}>
              <Text style={styles.sectionLabel}>Top posts</Text>
              {topPosts.length === 0 ? (
                <EmptyState
                  icon="chart-column"
                  title={`Nothing on ${PLATFORMS[platformIndex]} yet`}
                  body="Posts land here once they go live on this platform."
                  compact
                />
              ) : (
                topPosts.map((row) => {
                  const isPhoto =
                    row.assignment.briefs.format === 'photo_carousel';
                  const earned =
                    row.earnedCents > 0
                      ? earnedDollarsLabel(row.earnedCents)
                      : earnedDollarsLabel(
                          Math.round(
                            (row.assignment.bounty_amount_cents ?? 0) *
                              Math.min(1, row.views / 5000),
                          ),
                        );
                  return (
                    <PressableScale
                      key={row.assignment.id}
                      accessibilityRole="button"
                      onPress={() => openPosted(row.assignment)}
                      style={styles.topRow}
                    >
                      <View style={styles.topThumb}>
                        <Svg
                          width="100%"
                          height="100%"
                          style={StyleSheet.absoluteFill}
                        >
                          <Defs>
                            <LinearGradient
                              id={`top${row.assignment.id}`}
                              x1="0"
                              y1="0"
                              x2="0.35"
                              y2="1"
                            >
                              <Stop offset="0" stopColor={color.blue100} />
                              <Stop offset="1" stopColor={color.lineStrong} />
                            </LinearGradient>
                          </Defs>
                          <Rect
                            x="0"
                            y="0"
                            width="100%"
                            height="100%"
                            fill={`url(#top${row.assignment.id})`}
                          />
                        </Svg>
                        <Icon
                          name={isPhoto ? 'images' : 'play'}
                          size={13}
                          color={color.slate400}
                        />
                      </View>
                      <View style={styles.topBody}>
                        <Text style={styles.topTitle} numberOfLines={1}>
                          {row.assignment.briefs.title}
                        </Text>
                        <Text style={styles.topMeta}>
                          {`${formatCount(row.views)} views, ${formatCount(row.likes)} likes`}
                        </Text>
                      </View>
                      <Text style={styles.topEarned}>{earned}</Text>
                    </PressableScale>
                  );
                })
              )}
            </View>
          </>
        )}
      </ScrollView>
      <SoftToast
        visible={toast !== null}
        message={toast ?? ''}
        tone="error"
        onHide={() => setToast(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    paddingTop: space[5],
    paddingBottom: 0,
    gap: space[5],
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: space[3],
  },
  title: {
    fontSize: type.size.titleXl,
    lineHeight: type.size.titleXl * type.leading.title,
    letterSpacing: type.tracking.title,
    fontWeight: type.weight.heavy,
    color: color.ink,
  },
  earnedBlock: {
    alignItems: 'flex-end',
    gap: 1,
  },
  earnedValue: {
    fontSize: 24,
    fontWeight: type.weight.heavy,
    letterSpacing: type.tracking.title,
    color: color.ink,
  },
  earnedLabel: {
    fontSize: type.size.chip,
    color: color.slate500,
  },
  column: {
    gap: space[5],
    paddingBottom: 110,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  chartBlock: {
    gap: space[2],
  },
  sectionLabel: {
    fontSize: type.size.label,
    fontWeight: type.weight.heavy,
    letterSpacing: type.tracking.label,
    textTransform: 'uppercase',
    color: color.slate400,
  },
  sourceBlock: {
    gap: 10,
  },
  sourceBar: {
    flexDirection: 'row',
    height: 12,
    borderRadius: radius.pill,
    overflow: 'hidden',
    gap: 2,
  },
  sourceSeg: {
    height: '100%',
    borderRadius: radius.pill,
  },
  legend: {
    flexDirection: 'row',
    gap: space[5],
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
  },
  legendText: {
    fontSize: type.size.chip,
    color: color.slate500,
  },
  topBlock: {
    gap: space[2],
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    padding: 10,
    borderRadius: radius.md,
    backgroundColor: color.white,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
  },
  topThumb: {
    width: 38,
    height: 66,
    borderRadius: 8,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  topBody: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  topTitle: {
    fontSize: type.size.bodySm,
    fontWeight: type.weight.bold,
    color: color.ink,
  },
  topMeta: {
    fontSize: type.size.chip,
    color: color.slate500,
  },
  topEarned: {
    fontSize: type.size.bodySm,
    fontWeight: type.weight.heavy,
    color: color.ink,
  },
});
