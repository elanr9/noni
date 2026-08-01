import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AreaChart } from '../../../components/creator/AreaChart';
import { MiniStat } from '../../../components/creator/MiniStat';
import { SplitBar } from '../../../components/creator/SplitBar';
import { Dropdown } from '../../../components/ui/Dropdown';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Icon, type IconName } from '../../../components/ui/Icon';
import { PressableScale } from '../../../components/ui/PressableScale';
import { SkeletonCard } from '../../../components/ui/Skeleton';
import {
  fetchAnalytics,
  formatMetric,
  METRIC_KEYS,
  METRIC_LABELS,
  RANGE_DAYS,
  RANGE_KEYS,
  type AnalyticsSnapshot,
  type MetricKey,
  type RangeKey,
} from '../../../lib/analytics';
import { useAuth } from '../../../lib/auth';
import { color, shadow } from '../../../theme/tokens';

const METRIC_ICONS: Record<MetricKey, IconName> = {
  views: 'eye',
  likes: 'zap',
  comments: 'message-circle',
  shares: 'share-2',
};

function RangeToggle({
  value,
  onChange,
}: {
  value: RangeKey;
  onChange: (next: RangeKey) => void;
}) {
  return (
    <View style={styles.rangeTrack}>
      {RANGE_KEYS.map((key) => {
        const active = key === value;
        return (
          <PressableScale
            key={key}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(key)}
            style={[styles.rangeItem, active && [styles.rangeItemActive, shadow.shadowCard]]}
          >
            <Text style={[styles.rangeLabel, { color: active ? color.ink : color.slate500 }]}>
              {key}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

export default function AnalyticsScreen() {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const userId = session?.user?.id;

  const [range, setRange] = useState<RangeKey>('7D');
  const [metric, setMetric] = useState<MetricKey>('views');
  const [snapshot, setSnapshot] = useState<AnalyticsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setLoading(true);
    fetchAnalytics(userId)
      .then((data) => {
        if (!cancelled) setSnapshot(data);
      })
      .catch((error: unknown) => {
        console.error('analytics fetch failed', error);
        if (!cancelled) setSnapshot(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const days = RANGE_DAYS[range];

  if (!loading && (snapshot === null || !snapshot.hasData)) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Analytics</Text>
        </View>
        <View style={styles.emptyWrap}>
          <EmptyState
            icon="chart-column"
            title="No numbers yet"
            body="Once your first posts go out, growth shows up here — views, likes, comments, shares."
          />
        </View>
      </View>
    );
  }

  const current = snapshot?.metrics[range][metric];
  const miniMetrics = METRIC_KEYS.filter((key) => key !== metric);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Analytics</Text>
        <RangeToggle value={range} onChange={setRange} />
      </View>

      <View style={styles.dropdownRow}>
        <Dropdown
          options={METRIC_KEYS.map((key) => ({ label: METRIC_LABELS[key], value: key }))}
          value={metric}
          onChange={setMetric}
          icon={METRIC_ICONS[metric]}
        />
      </View>

      {loading || !snapshot || !current ? (
        <View style={styles.stack}>
          <SkeletonCard height={244} />
          <View style={styles.miniRow}>
            <SkeletonCard height={88} radius={16} style={styles.miniSkeleton} />
            <SkeletonCard height={88} radius={16} style={styles.miniSkeleton} />
            <SkeletonCard height={88} radius={16} style={styles.miniSkeleton} />
          </View>
          <SkeletonCard height={90} />
        </View>
      ) : (
        <View style={styles.stack}>
          <View style={[styles.chartCard, shadow.shadowCard]}>
            <Text style={styles.chartLabel}>
              {METRIC_LABELS[metric]} · last {days} days
            </Text>
            <View style={styles.numberRow}>
              <Text style={styles.bigNumber}>{formatMetric(current.total)}</Text>
              <View style={styles.deltaChip}>
                <Icon name="trending-up" size={13} color={color.green} />
                <Text style={styles.deltaText}>{current.deltaLabel}</Text>
              </View>
            </View>
            <AreaChart key={`${metric}-${range}`} series={current.series} />
            <View style={styles.axisRow}>
              <Text style={styles.axisLabel}>{days} days ago</Text>
              <Text style={styles.axisLabel}>Today</Text>
            </View>
          </View>

          <View style={styles.miniRow}>
            {miniMetrics.map((key) => {
              const stat = snapshot.metrics[range][key];
              return (
                <MiniStat
                  key={key}
                  label={METRIC_LABELS[key]}
                  icon={METRIC_ICONS[key]}
                  value={formatMetric(stat.total)}
                  delta={stat.deltaLabel}
                  series={stat.series}
                  onPress={() => setMetric(key)}
                />
              );
            })}
          </View>

          <SplitBar
            range={range}
            tiktokPct={snapshot.split.tiktokPct}
            instagramPct={snapshot.split.instagramPct}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: color.offWhite,
    paddingHorizontal: 24,
    paddingBottom: 96,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 30,
    fontWeight: '700',
    letterSpacing: -0.5,
    color: color.ink,
  },
  rangeTrack: {
    flexDirection: 'row',
    gap: 3,
    padding: 3,
    borderRadius: 999,
    backgroundColor: color.fillQuiet,
  },
  rangeItem: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
  },
  rangeItemActive: {
    backgroundColor: color.white,
  },
  rangeLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  dropdownRow: {
    marginTop: 12,
    zIndex: 30,
  },
  stack: {
    marginTop: 12,
    gap: 12,
  },
  chartCard: {
    backgroundColor: color.white,
    borderRadius: 18,
    padding: 16,
  },
  chartLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: color.slate500,
  },
  numberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    marginBottom: 8,
  },
  bigNumber: {
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: -1,
    color: color.ink,
  },
  deltaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: color.greenSoft,
  },
  deltaText: {
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 13,
    color: color.green,
  },
  axisRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  axisLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: color.slate400,
  },
  miniRow: {
    flexDirection: 'row',
    gap: 8,
  },
  miniSkeleton: {
    flex: 1,
  },
  emptyWrap: {
    flex: 1,
    justifyContent: 'center',
  },
});
