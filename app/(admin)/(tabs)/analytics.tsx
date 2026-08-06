import { useCallback, useState } from 'react';
import {
  Alert,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import { DayDetailSheet } from '../../../components/admin/DayDetailSheet';
import { BestHookRow } from '../../../components/admin/insights/BestHookRow';
import { PerCreatorRow } from '../../../components/admin/insights/PerCreatorRow';
import {
  AdminHeader,
  AdminScreen,
  SectionLabel,
  Segmented,
  SkeletonCard,
} from '../../../components/admin/shared';
import { TimeSeriesChart } from '../../../components/admin/TimeSeriesChart';
import { Button } from '../../../components/ui/Button';
import { Icon } from '../../../components/ui/Icon';
import { PressableScale } from '../../../components/ui/PressableScale';
import { useAuth } from '../../../lib/auth';
import {
  fetchBriefAnalytics,
  fetchCreatorLeaderboard,
  startMetricsPoll,
  type BriefAnalytics,
  type CreatorLeaderboardRow,
} from '../../../lib/admin-api';
import { formatMetric } from '../../../lib/analytics';
import {
  fetchCompanyTimeSeries,
  type CompanyTimeSeries,
  type SeriesMetricKey,
} from '../../../lib/analytics-api';
import { supabase } from '../../../lib/supabase';
import { formatCents } from '../../../lib/wallet-api';
import {
  borderWidth,
  color,
  radiusAdmin,
  type,
} from '../../../theme/tokens';

const RANGE_DAYS = [7, 30, 90];

const METRICS: Array<{ key: SeriesMetricKey; label: string; money: boolean }> = [
  { key: 'views', label: 'Views', money: false },
  { key: 'revenue', label: 'Revenue', money: true },
  { key: 'sales', label: 'Sales', money: false },
];

function localDayKey(date: Date): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Per-creator revenue and roster photos live outside the series query. */
async function fetchCreatorRevenue(
  companyId: string,
  rangeDays: number,
): Promise<Map<string, number> | null> {
  const since = new Date();
  since.setDate(since.getDate() - (rangeDays - 1));
  const { data } = await supabase
    .from('conversion_daily')
    .select('creator_id, sales_cents')
    .eq('company_id', companyId)
    .not('creator_id', 'is', null)
    .gte('day', localDayKey(since));
  if (!data || data.length === 0) return null;
  const byCreator = new Map<string, number>();
  for (const row of data) {
    if (row.creator_id === null) continue;
    byCreator.set(
      row.creator_id,
      (byCreator.get(row.creator_id) ?? 0) + row.sales_cents,
    );
  }
  return byCreator;
}

async function fetchAvatars(companyId: string): Promise<Map<string, string>> {
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, avatar_path')
    .eq('company_id', companyId)
    .eq('role', 'creator');
  const withPath = (profiles ?? []).filter(
    (p): p is { id: string; avatar_path: string } => p.avatar_path !== null,
  );
  const uris = new Map<string, string>();
  if (withPath.length === 0) return uris;
  const { data: signed } = await supabase.storage
    .from('avatars')
    .createSignedUrls(withPath.map((p) => p.avatar_path), 3600);
  const byPath = new Map<string, string>();
  for (const entry of signed ?? []) {
    if (entry.path !== null && entry.signedUrl) byPath.set(entry.path, entry.signedUrl);
  }
  for (const p of withPath) {
    const uri = byPath.get(p.avatar_path);
    if (uri !== undefined) uris.set(p.id, uri);
  }
  return uris;
}

export default function AnalyticsScreen() {
  const { profile } = useAuth();
  const [series, setSeries] = useState<CompanyTimeSeries | null>(null);
  const [creators, setCreators] = useState<CreatorLeaderboardRow[]>([]);
  const [hooks, setHooks] = useState<BriefAnalytics['bestHooks']>([]);
  const [creatorRevenue, setCreatorRevenue] = useState<Map<string, number> | null>(null);
  const [avatars, setAvatars] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [polling, setPolling] = useState(false);
  const [rangeIndex, setRangeIndex] = useState(1);
  const [metricIndex, setMetricIndex] = useState(0);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const rangeDays = RANGE_DAYS[rangeIndex];

  const load = useCallback(async () => {
    if (!profile) return;
    try {
      // Double window: back half is the chart, front half is the delta base.
      const [doubled, leaderboard, briefAnalytics] = await Promise.all([
        fetchCompanyTimeSeries(profile.company_id, RANGE_DAYS[rangeIndex] * 2),
        fetchCreatorLeaderboard(profile.company_id),
        fetchBriefAnalytics(profile.company_id),
      ]);
      setSeries(doubled);
      setCreators(leaderboard);
      setHooks(briefAnalytics.bestHooks);
    } catch (e) {
      Alert.alert('Could not load', e instanceof Error ? e.message : 'Try again');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
    void fetchCreatorRevenue(profile.company_id, RANGE_DAYS[rangeIndex])
      .then(setCreatorRevenue)
      .catch(() => undefined);
    void fetchAvatars(profile.company_id)
      .then(setAvatars)
      .catch(() => undefined);
  }, [profile, rangeIndex]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function pollNow() {
    setPolling(true);
    try {
      await startMetricsPoll();
      await load();
      Alert.alert('Metrics updated', 'Fresh numbers from Upload-Post.');
    } catch (e) {
      Alert.alert('Poll failed', e instanceof Error ? e.message : 'Try again');
    } finally {
      setPolling(false);
    }
  }

  const metric = METRICS[metricIndex];
  const currentDays = series ? series.days.slice(rangeDays) : [];
  const previousDays = series ? series.days.slice(0, rangeDays) : [];
  const currentTotal = currentDays.reduce((s, d) => s + d.metrics[metric.key], 0);
  const previousTotal = previousDays.reduce((s, d) => s + d.metrics[metric.key], 0);
  const deltaPct =
    previousTotal > 0
      ? Math.round(((currentTotal - previousTotal) / previousTotal) * 100)
      : null;

  return (
    <>
      <AdminScreen
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
        <AdminHeader
          title="Analytics"
          trailing={
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="Settings"
              onPress={() => router.push('/(admin)/(tabs)/settings')}
              style={styles.gearBtn}
            >
              <Icon name="settings" size={20} color={color.slate500} />
            </PressableScale>
          }
        />

        <Segmented
          options={METRICS.map((m) => ({ label: m.label }))}
          value={metricIndex}
          onChange={(index) => {
            setMetricIndex(index);
            setSelectedDay(null);
          }}
        />

        <View style={styles.rangeRow}>
          {RANGE_DAYS.map((days, index) => {
            const active = index === rangeIndex;
            return (
              <PressableScale
                key={days}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => {
                  if (index === rangeIndex) return;
                  setRangeIndex(index);
                  setSelectedDay(null);
                  setLoading(true);
                }}
                style={[styles.rangeChip, active && styles.rangeChipActive]}
              >
                <Text style={[styles.rangeText, active && styles.rangeTextActive]}>
                  {`${days}D`}
                </Text>
              </PressableScale>
            );
          })}
        </View>

        {loading || !series ? (
          <View style={styles.skeletons}>
            <SkeletonCard height={72} radius={radiusAdmin.lg} />
            <SkeletonCard height={260} radius={radiusAdmin.lg} />
            <SkeletonCard height={64} radius={radiusAdmin.lg} />
            <SkeletonCard height={64} radius={radiusAdmin.lg} />
          </View>
        ) : (
          <>
            <View style={styles.headline}>
              <Text style={styles.headlineValue}>
                {metric.money ? formatCents(currentTotal) : formatMetric(currentTotal)}
              </Text>
              <View style={styles.headlineMetaRow}>
                <Text style={styles.headlineRange}>
                  {`${metric.label} · last ${rangeDays} days`}
                </Text>
                {deltaPct !== null && (
                  <Text
                    style={[
                      styles.deltaPill,
                      deltaPct >= 0 ? styles.deltaUp : styles.deltaDown,
                    ]}
                  >
                    {`${deltaPct >= 0 ? '+' : ''}${deltaPct}%`}
                  </Text>
                )}
              </View>
            </View>

            <View style={styles.chartCard}>
              <TimeSeriesChart
                days={currentDays}
                metric={metric.key}
                money={metric.money}
                selectedIndex={selectedDay}
                onSelectDay={setSelectedDay}
              />
            </View>

            {!series.hasConversions && metric.key !== 'views' ? (
              <Text style={styles.note}>
                Conversion sync has not run yet. Sales appear once FieldVision
                data lands; revenue shows tracked-link events meanwhile.
              </Text>
            ) : null}

            <SectionLabel style={styles.section}>Per creator</SectionLabel>
            <View style={styles.rows}>
              {creators.length === 0 ? (
                <Text style={styles.empty}>No creators on the roster yet.</Text>
              ) : (
                creators.map((c) => {
                  const revenueCents = creatorRevenue?.get(c.creatorId);
                  return (
                    <PerCreatorRow
                      key={c.creatorId}
                      name={c.creatorName}
                      avatarUri={avatars.get(c.creatorId) ?? null}
                      meta={`${c.postsCompleted} posts · ${formatMetric(c.views)} views`}
                      revenue={
                        creatorRevenue === null
                          ? 'Pending'
                          : formatCents(revenueCents ?? 0)
                      }
                      revenuePending={creatorRevenue === null}
                    />
                  );
                })
              )}
            </View>

            <SectionLabel style={styles.section}>Best hooks</SectionLabel>
            <View style={styles.rows}>
              {hooks.length === 0 ? (
                <Text style={styles.empty}>
                  Hooks rank here once posts are live and views come in.
                </Text>
              ) : (
                hooks
                  .slice(0, 5)
                  .map((h, i) => (
                    <BestHookRow
                      key={`${h.hook}-${i}`}
                      rank={i + 1}
                      hook={h.hook}
                      views={formatMetric(h.views)}
                    />
                  ))
              )}
            </View>

            <Button
              size="sm"
              variant="ghost"
              block
              disabled={polling}
              onPress={() => void pollNow()}
              style={styles.pollBtn}
            >
              {polling ? 'Polling…' : 'Poll metrics now'}
            </Button>
          </>
        )}
      </AdminScreen>

      <DayDetailSheet
        day={
          selectedDay !== null && currentDays[selectedDay] !== undefined
            ? currentDays[selectedDay]
            : null
        }
        onClose={() => setSelectedDay(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  gearBtn: {
    width: 38,
    height: 38,
    borderRadius: radiusAdmin.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.white,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
  },
  rangeRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 10,
  },
  rangeChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.white,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
  },
  rangeChipActive: {
    backgroundColor: color.blue500,
    borderColor: color.blue500,
  },
  rangeText: {
    fontSize: type.size.label,
    fontWeight: '700',
    color: color.slate500,
  },
  rangeTextActive: {
    color: color.white,
  },
  skeletons: {
    marginTop: 14,
    gap: 10,
  },
  headline: {
    marginTop: 14,
    gap: 2,
  },
  headlineValue: {
    fontSize: type.size.titleXl,
    fontWeight: '700',
    letterSpacing: type.tracking.title,
    color: color.ink,
  },
  headlineMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headlineRange: {
    fontSize: type.size.chip,
    fontWeight: '600',
    color: color.slate500,
  },
  deltaPill: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: radiusAdmin.pill,
    fontSize: type.size.micro11,
    fontWeight: '700',
    overflow: 'hidden',
  },
  deltaUp: {
    backgroundColor: color.greenSoft,
    color: color.green,
  },
  deltaDown: {
    backgroundColor: color.fillQuiet,
    color: color.slate500,
  },
  chartCard: {
    marginTop: 10,
  },
  note: {
    marginTop: 8,
    fontSize: type.size.chip,
    fontWeight: '600',
    color: color.slate500,
    lineHeight: type.size.chip * type.leading.body,
  },
  section: {
    marginTop: 22,
    marginBottom: 10,
  },
  rows: {
    gap: 10,
  },
  empty: {
    fontSize: type.size.bodySm,
    color: color.slate500,
    fontWeight: '600',
  },
  pollBtn: {
    marginTop: 18,
  },
});
