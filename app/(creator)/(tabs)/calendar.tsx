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

import { formatViews } from '../../../components/creator/PostCard';
import { MonthGrid } from '../../../components/creator/MonthGrid';
import { WeekStrip, type WeekDay } from '../../../components/creator/WeekStrip';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Icon } from '../../../components/ui/Icon';
import { PressableScale } from '../../../components/ui/PressableScale';
import { Segmented } from '../../../components/ui/Segmented';
import { SkeletonCard } from '../../../components/ui/Skeleton';
import { StatusChip } from '../../../components/StatusChip';
import { Button } from '../../../components/ui/Button';
import { useAuth } from '../../../lib/auth';
import {
  listMyAssignments,
  parseAssignmentMetrics,
  type AssignmentWithBrief,
} from '../../../lib/tasks-api';
import { color } from '../../../theme/tokens';

const DOW_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const;
const DONE_STATUSES = new Set(['posted', 'approved']);
const TODO_STATUSES = new Set(['assigned', 'changes_requested']);

function dayKey(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const dd = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${dd}`;
}

function mondayOf(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  const dow = out.getDay();
  out.setDate(out.getDate() + (dow === 0 ? -6 : 1 - dow));
  return out;
}

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

export default function CalendarScreen() {
  const { profile } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [assignments, setAssignments] = useState<AssignmentWithBrief[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [view, setView] = useState(0);
  const [selectedKey, setSelectedKey] = useState(dayKey(new Date()));

  const load = useCallback(async () => {
    if (!profile?.id) return;
    try {
      setAssignments(await listMyAssignments(profile.id));
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

  const todayKey = dayKey(new Date());

  const weekDays = useMemo<WeekDay[]>(() => {
    const monday = mondayOf(new Date());
    return DOW_LETTERS.map((dow, i) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + i);
      const key = dayKey(date);
      const dayAssignments = byDay.get(key) ?? [];
      return {
        key,
        dow,
        dayNumber: date.getDate(),
        postCount: dayAssignments.length,
        done:
          dayAssignments.length > 0 &&
          dayAssignments.every((a) => DONE_STATUSES.has(a.status)),
        isToday: key === todayKey,
      };
    });
  }, [byDay, todayKey]);

  const now = new Date();
  const monthCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    for (const [key, list] of byDay) {
      const [y, m, d] = key.split('-').map(Number);
      if (y === now.getFullYear() && m === now.getMonth() + 1) {
        counts[d] = list.length;
      }
    }
    return counts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [byDay]);

  const dayAssignments = (byDay.get(selectedKey) ?? []).slice(0, 3);
  const isPastDay = selectedKey < todayKey;
  const selectedDayNumber = Number(selectedKey.split('-')[2]);

  const openAssignment = (a: AssignmentWithBrief) => {
    router.push(`/(creator)/assignment/${a.id}`);
  };

  const recordAssignment = (a: AssignmentWithBrief) => {
    if (a.briefs.format === 'photo_carousel') {
      openAssignment(a);
    } else {
      router.push(`/(creator)/record/${a.id}?assignment=1`);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>Calendar</Text>
        <View style={styles.toggle}>
          <Segmented options={['Week', 'Month']} value={view} onChange={setView} />
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
        {view === 0 ? (
          <WeekStrip
            days={weekDays}
            selectedKey={selectedKey}
            onSelect={setSelectedKey}
          />
        ) : (
          <MonthGrid
            year={now.getFullYear()}
            month={now.getMonth()}
            postCounts={monthCounts}
            selectedDay={selectedDayNumber}
            todayDay={now.getDate()}
            onSelectDay={(day) => {
              const d = new Date(now.getFullYear(), now.getMonth(), day);
              setSelectedKey(dayKey(d));
            }}
          />
        )}

        {loading ? (
          <>
            <SkeletonCard height={120} radius={18} />
            <SkeletonCard height={120} radius={18} />
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
            const metrics = parseAssignmentMetrics(a.metrics);
            const done = DONE_STATUSES.has(a.status);
            const canRecord = TODO_STATUSES.has(a.status);
            return (
              <PressableScale
                key={a.id}
                accessibilityRole="button"
                style={styles.card}
                onPress={() => openAssignment(a)}
              >
                <View style={styles.cardHead}>
                  <View style={styles.cardText}>
                    <Text style={styles.cardTitle} numberOfLines={2}>
                      {a.briefs.title}
                    </Text>
                    {a.briefs.hook ? (
                      <Text style={styles.cardHook} numberOfLines={1}>
                        {a.briefs.hook}
                      </Text>
                    ) : null}
                  </View>
                  <StatusChip status={a.status} />
                </View>

                {isPastDay && done ? (
                  <View style={styles.statsRow}>
                    <View style={styles.stat}>
                      <Text style={styles.statValue}>
                        {metrics.views !== undefined
                          ? formatViews(metrics.views)
                          : '—'}
                      </Text>
                      <Text style={styles.statLabel}>Views</Text>
                    </View>
                    <View style={styles.stat}>
                      <Text style={styles.statValue}>
                        {metrics.likes !== undefined
                          ? formatViews(metrics.likes)
                          : '—'}
                      </Text>
                      <Text style={styles.statLabel}>Likes</Text>
                    </View>
                    <View style={styles.stat}>
                      <Text style={styles.statValue}>
                        {metrics.revenue_cents !== undefined
                          ? formatMoney(metrics.revenue_cents)
                          : '—'}
                      </Text>
                      <Text style={styles.statLabel}>Revenue</Text>
                    </View>
                    <View style={styles.stat}>
                      <Text style={styles.statValue}>
                        {a.bounty_credited_at !== null
                          ? formatMoney(a.bounty_amount_cents ?? 0)
                          : 'Pending'}
                      </Text>
                      <Text style={styles.statLabel}>Bounty</Text>
                    </View>
                  </View>
                ) : canRecord ? (
                  // Batch recording: the whole week is unlocked. Posting
                  // stays scheduled to the assigned day.
                  <View style={styles.cardFooter}>
                    <Button
                      variant="primary"
                      size="sm"
                      icon={a.briefs.format === 'photo_carousel' ? 'images' : 'video'}
                      onPress={() => recordAssignment(a)}
                    >
                      {a.briefs.format === 'photo_carousel' ? 'Create' : 'Record'}
                    </Button>
                    <Text style={styles.footerNote}>
                      Posts {selectedKey === todayKey ? 'today' : 'on its day'}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.cardFooter}>
                    <Icon name="clock" size={14} color={color.slate400} />
                    <Text style={styles.footerNote}>Waiting on review</Text>
                  </View>
                )}
              </PressableScale>
            );
          })
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
    width: 168,
  },
  column: {
    paddingHorizontal: 24,
    paddingBottom: 110,
    gap: 12,
  },
  card: {
    backgroundColor: color.white,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: 18,
    padding: 16,
    gap: 12,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  cardText: {
    flex: 1,
    gap: 3,
  },
  cardTitle: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '700',
    color: color.ink,
  },
  cardHook: {
    fontSize: 13,
    color: color.slate500,
  },
  statsRow: {
    flexDirection: 'row',
  },
  stat: {
    flex: 1,
    gap: 2,
  },
  statValue: {
    fontSize: 15,
    fontWeight: '700',
    color: color.ink,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: color.slate400,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  footerNote: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: color.slate500,
  },
});
