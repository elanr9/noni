import { useCallback, useState } from 'react';
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DayDetailSheet } from '../../../components/admin/DayDetailSheet';
import { TimeSeriesChart } from '../../../components/admin/TimeSeriesChart';
import { Button } from '../../../components/ui/Button';
import { Icon } from '../../../components/ui/Icon';
import { PressableScale } from '../../../components/ui/PressableScale';
import { Segmented } from '../../../components/ui/Segmented';
import { useAuth } from '../../../lib/auth';
import { startMetricsPoll } from '../../../lib/admin-api';
import { formatMetric } from '../../../lib/analytics';
import {
  fetchCompanyTimeSeries,
  SERIES_METRICS,
  type CompanyTimeSeries,
  type SeriesMetricKey,
} from '../../../lib/analytics-api';
import { formatCents } from '../../../lib/wallet-api';
import { borderWidth, color, radius, shadow, space, type } from '../../../theme/tokens';

const RANGES = ['7D', '30D', '90D'];
const RANGE_DAYS = [7, 30, 90];

export default function AnalyticsScreen() {
  const { profile } = useAuth();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<CompanyTimeSeries | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [polling, setPolling] = useState(false);
  const [rangeIndex, setRangeIndex] = useState(1);
  const [metric, setMetric] = useState<SeriesMetricKey>('views');
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    try {
      setData(
        await fetchCompanyTimeSeries(profile.company_id, RANGE_DAYS[rangeIndex]),
      );
    } catch (e) {
      Alert.alert('Could not load', e instanceof Error ? e.message : 'Try again');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
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

  const activeMetric = SERIES_METRICS.find((m) => m.key === metric)!;
  const total = data?.totals[metric] ?? 0;

  return (
    <>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 6, paddingBottom: 116 },
        ]}
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
        <View style={styles.headerRow}>
          <Text style={styles.h1}>Analytics</Text>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="Settings"
            onPress={() => router.push('/(admin)/(tabs)/settings')}
            style={styles.gearBtn}
          >
            <Icon name="settings" size={20} color={color.slate500} />
          </PressableScale>
        </View>
        <Text style={styles.subtitle}>
          Posting activity and what it converted, day by day. Tap a day.
        </Text>

        <Segmented
          options={RANGES}
          value={rangeIndex}
          onChange={(index) => {
            setRangeIndex(index);
            setSelectedDay(null);
            setLoading(true);
          }}
        />

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          {SERIES_METRICS.map((m) => {
            const active = m.key === metric;
            return (
              <PressableScale
                key={m.key}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => setMetric(m.key)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>
                  {m.label}
                </Text>
              </PressableScale>
            );
          })}
        </ScrollView>

        {loading || !data ? (
          <Text style={styles.empty}>Loading analytics…</Text>
        ) : (
          <>
            <View style={[styles.card, shadow.shadowCard]}>
              <Text style={styles.totalValue}>
                {activeMetric.money ? formatCents(total) : formatMetric(total)}
              </Text>
              <Text style={styles.totalLabel}>
                {activeMetric.label} · last {RANGE_DAYS[rangeIndex]} days
              </Text>
              <TimeSeriesChart
                days={data.days}
                metric={metric}
                money={activeMetric.money ?? false}
                selectedIndex={selectedDay}
                onSelectDay={setSelectedDay}
              />
            </View>
            {!data.hasConversions ? (
              <Text style={styles.note}>
                Conversion sync has not run yet. Sales, accounts and trials
                appear once FieldVision data lands; revenue shows tracked-link
                events meanwhile.
              </Text>
            ) : null}
          </>
        )}

        <Button
          size="sm"
          variant="secondary"
          block
          disabled={polling}
          onPress={() => void pollNow()}
          style={styles.pollBtn}
        >
          {polling ? 'Polling…' : 'Poll metrics now'}
        </Button>
      </ScrollView>

      <DayDetailSheet
        day={selectedDay !== null && data ? data.days[selectedDay] : null}
        onClose={() => setSelectedDay(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.offWhite },
  content: { paddingHorizontal: space.gutter, gap: 10 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  h1: {
    fontSize: type.size.titleXl,
    lineHeight: type.size.titleXl * type.leading.title,
    fontWeight: '800',
    letterSpacing: type.tracking.title,
    color: color.ink,
  },
  gearBtn: {
    width: 38,
    height: 38,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.white,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
  },
  subtitle: {
    fontSize: type.size.bodySm,
    fontWeight: '600',
    color: color.slate500,
    marginBottom: 4,
  },
  chipRow: { gap: 6, paddingVertical: 2 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: color.white,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
  },
  chipActive: {
    backgroundColor: color.ink,
    borderColor: color.ink,
  },
  chipLabel: {
    fontSize: type.size.chip,
    fontWeight: '700',
    color: color.slate500,
  },
  chipLabelActive: { color: color.white },
  card: {
    backgroundColor: color.white,
    borderRadius: radius.md,
    padding: 14,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
    gap: 4,
  },
  totalValue: {
    fontSize: type.size.titleSm,
    fontWeight: '800',
    color: color.ink,
  },
  totalLabel: {
    fontSize: type.size.micro,
    fontWeight: '700',
    color: color.slate400,
    textTransform: 'uppercase',
    letterSpacing: type.tracking.label,
    marginBottom: 6,
  },
  note: {
    fontSize: type.size.chip,
    fontWeight: '600',
    color: color.slate500,
    lineHeight: 18,
  },
  empty: {
    fontSize: type.size.bodySm,
    color: color.slate500,
    fontWeight: '600',
  },
  pollBtn: { marginTop: 4 },
});
