import { useCallback, useMemo, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { MonthGrid } from '../../../components/creator/MonthGrid';
import { PostGridTile } from '../../../components/creator/PostGridTile';
import { Screen } from '../../../components/layout/Screen';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Icon } from '../../../components/ui/Icon';
import { PressableScale } from '../../../components/ui/PressableScale';
import { Segmented } from '../../../components/ui/Segmented';
import { SkeletonCard } from '../../../components/ui/Skeleton';
import { StatusChip } from '../../../components/ui/StatusChip';
import { useAuth } from '../../../lib/auth';
import { formatCount } from '../../../lib/earnings';
import type { TaskStatus } from '../../../lib/tasks';
import {
  listMyAssignments,
  parseAssignmentMetrics,
  type AssignmentWithBrief,
} from '../../../lib/tasks-api';
import { formatCents, listLedger, type WalletLedgerRow } from '../../../lib/wallet-api';
import {
  borderWidth,
  color,
  radius,
  shadow,
  space,
  type,
} from '../../../theme/tokens';

const EARNING_KINDS = new Set(['bounty_credit', 'streak_bonus']);
const DONE_STATUSES = new Set<TaskStatus>(['posted', 'approved']);
const GRID_GAP = 6;

const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

function dayKey(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const dd = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${dd}`;
}

function formatLabel(format: string): string {
  return format === 'photo_carousel' ? 'Slideshow' : 'Reel';
}

export default function PostsScreen() {
  const { profile } = useAuth();
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();
  const tileWidth = Math.floor(
    (windowWidth - space.gutter * 2 - GRID_GAP * 2) / 3,
  );

  const [assignments, setAssignments] = useState<AssignmentWithBrief[]>([]);
  const [ledger, setLedger] = useState<WalletLedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [view, setView] = useState(0);
  const [cursor, setCursor] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [selectedKey, setSelectedKey] = useState(dayKey(new Date()));

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

  const byDay = useMemo(() => {
    const map = new Map<string, AssignmentWithBrief[]>();
    for (const a of assignments) {
      const list = map.get(a.scheduled_date) ?? [];
      list.push(a);
      map.set(a.scheduled_date, list);
    }
    return map;
  }, [assignments]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();

  const monthCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    for (const [key, list] of byDay) {
      const [y, m, d] = key.split('-').map(Number);
      if (y === year && m === month + 1) {
        counts[d ?? 0] = list.length;
      }
    }
    return counts;
  }, [byDay, year, month]);

  const dayAssignments = byDay.get(selectedKey) ?? [];
  const selectedDayNumber = Number(selectedKey.split('-')[2]);
  const selectedDate = new Date(
    Number(selectedKey.slice(0, 4)),
    Number(selectedKey.slice(5, 7)) - 1,
    selectedDayNumber,
  );
  const dayHeading =
    `${WEEKDAYS[selectedDate.getDay()]} ${selectedDayNumber}`.toUpperCase();

  const summary = useMemo(() => {
    let views = 0;
    for (const a of assignments) {
      if (!DONE_STATUSES.has(a.status as TaskStatus)) continue;
      views += parseAssignmentMetrics(a.metrics).views ?? 0;
    }
    let earnedCents = 0;
    for (const entry of ledger) {
      if (EARNING_KINDS.has(entry.kind)) earnedCents += entry.amount_cents;
    }
    return {
      posts: assignments.length,
      views,
      earnedLabel: formatCents(earnedCents).replace(/\.00$/, ''),
    };
  }, [assignments, ledger]);

  const gridItems = useMemo(
    () =>
      [...assignments].sort((a, b) =>
        a.scheduled_date === b.scheduled_date
          ? b.slot_index - a.slot_index
          : b.scheduled_date.localeCompare(a.scheduled_date),
      ),
    [assignments],
  );

  const openAssignment = (a: AssignmentWithBrief) => {
    if (DONE_STATUSES.has(a.status as TaskStatus)) {
      router.push(`/(creator)/posts/${a.id}` as Href);
    } else {
      router.push(`/(creator)/assignment/${a.id}`);
    }
  };

  const selectDayInMonth = (day: number) => {
    setSelectedKey(dayKey(new Date(year, month, day)));
  };

  const shiftMonth = (delta: number) => {
    const next = new Date(year, month + delta, 1);
    setCursor(next);
    const daysIn = new Date(
      next.getFullYear(),
      next.getMonth() + 1,
      0,
    ).getDate();
    const keep = Math.min(selectedDayNumber || 1, daysIn);
    setSelectedKey(
      dayKey(new Date(next.getFullYear(), next.getMonth(), keep)),
    );
  };

  const monthPrefix = `${year}-${`${month + 1}`.padStart(2, '0')}`;

  return (
    <Screen scroll={false} bg={color.white} contentStyle={styles.screenContent}>
      <Text style={styles.title}>Posts</Text>
      <Segmented options={['Calendar', 'Grid']} value={view} onChange={setView} />

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
        {view === 0 ? (
          <>
            <MonthGrid
              year={year}
              month={month}
              postCounts={monthCounts}
              selectedDay={
                selectedKey.startsWith(monthPrefix) ? selectedDayNumber : 0
              }
              onSelectDay={selectDayInMonth}
              onPrevMonth={() => shiftMonth(-1)}
              onNextMonth={() => shiftMonth(1)}
            />
            <Text style={styles.dayHeading}>{dayHeading}</Text>
            {loading ? (
              <>
                <SkeletonCard height={120} radius={radius.lg} />
                <SkeletonCard height={120} radius={radius.lg} />
              </>
            ) : dayAssignments.length === 0 ? (
              <EmptyState
                icon="calendar-days"
                title="Nothing this day"
                body="Posts land here when the weekly campaign drops."
                compact
              />
            ) : (
              dayAssignments.map((a) => {
                const isPhoto = a.briefs.format === 'photo_carousel';
                return (
                  <PressableScale
                    key={a.id}
                    accessibilityRole="button"
                    onPress={() => openAssignment(a)}
                    style={[styles.dayRow, shadow.shadowCard]}
                  >
                    <View style={styles.thumb}>
                      <Svg
                        width="100%"
                        height="100%"
                        style={StyleSheet.absoluteFill}
                      >
                        <Defs>
                          <LinearGradient
                            id={`dayThumb${a.id}`}
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
                          fill={`url(#dayThumb${a.id})`}
                        />
                      </Svg>
                      <Icon
                        name={isPhoto ? 'images' : 'play'}
                        size={16}
                        color={color.slate400}
                      />
                    </View>
                    <View style={styles.dayBody}>
                      <Text style={styles.dayTitle} numberOfLines={2}>
                        {a.briefs.title}
                      </Text>
                      <View style={styles.dayMeta}>
                        <StatusChip status={a.status as TaskStatus} />
                        <Text style={styles.dayFormat}>
                          {formatLabel(a.briefs.format)}
                        </Text>
                      </View>
                      <Text style={styles.dayDue}>{`Post ${a.slot_index + 1}`}</Text>
                    </View>
                  </PressableScale>
                );
              })
            )}
          </>
        ) : (
          <>
            <View style={styles.summaryRow}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>{summary.posts}</Text>
                <Text style={styles.summaryLabel}>posts</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>
                  {formatCount(summary.views)}
                </Text>
                <Text style={styles.summaryLabel}>views</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>{summary.earnedLabel}</Text>
                <Text style={styles.summaryLabel}>earned</Text>
              </View>
            </View>

            {loading ? (
              <View style={styles.grid}>
                <SkeletonCard height={197} radius={10} style={{ width: tileWidth }} />
                <SkeletonCard height={197} radius={10} style={{ width: tileWidth }} />
                <SkeletonCard height={197} radius={10} style={{ width: tileWidth }} />
              </View>
            ) : gridItems.length === 0 ? (
              <EmptyState
                icon="layout-list"
                title="No posts yet"
                body="Posts land here when the weekly campaign drops."
              />
            ) : (
              <View style={styles.grid}>
                {gridItems.map((a) => (
                  <PostGridTile
                    key={a.id}
                    width={tileWidth}
                    status={a.status as TaskStatus}
                    isPhoto={a.briefs.format === 'photo_carousel'}
                    views={parseAssignmentMetrics(a.metrics).views ?? 0}
                    onPress={() => openAssignment(a)}
                  />
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
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
  title: {
    fontSize: type.size.titleXl,
    lineHeight: type.size.titleXl * type.leading.title,
    letterSpacing: type.tracking.title,
    fontWeight: type.weight.heavy,
    color: color.ink,
  },
  column: {
    gap: space[5],
    paddingBottom: 110,
  },
  dayHeading: {
    fontSize: type.size.label,
    fontWeight: type.weight.heavy,
    letterSpacing: type.tracking.label,
    color: color.slate400,
  },
  dayRow: {
    flexDirection: 'row',
    gap: space[3],
    padding: space[3],
    borderRadius: radius.lg,
    backgroundColor: color.white,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
  },
  thumb: {
    width: 54,
    height: 96,
    borderRadius: 10,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  dayBody: {
    flex: 1,
    minWidth: 0,
    gap: 7,
  },
  dayTitle: {
    fontSize: type.size.bodySm,
    fontWeight: type.weight.bold,
    lineHeight: type.size.bodySm * type.leading.snug,
    color: color.ink,
  },
  dayMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
  },
  dayFormat: {
    fontSize: type.size.chip,
    color: color.slate500,
  },
  dayDue: {
    fontSize: type.size.chip,
    color: color.slate500,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 22,
    paddingVertical: 2,
  },
  summaryItem: {
    gap: 2,
  },
  summaryValue: {
    fontSize: type.size.cardLg,
    fontWeight: type.weight.heavy,
    color: color.ink,
  },
  summaryLabel: {
    fontSize: type.size.chip,
    color: color.slate500,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_GAP,
  },
});
