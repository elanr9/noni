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

import { MonthGrid } from '../../../components/creator/MonthGrid';
import { PostRow } from '../../../components/creator/PostRow';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Segmented } from '../../../components/ui/Segmented';
import { SkeletonCard } from '../../../components/ui/Skeleton';
import { useAuth } from '../../../lib/auth';
import {
  listMyAssignments,
  parseAssignmentMetrics,
  type AssignmentWithBrief,
} from '../../../lib/tasks-api';
import { color } from '../../../theme/tokens';

const DONE_STATUSES = new Set(['posted', 'approved']);
const TODO_STATUSES = new Set(['assigned', 'changes_requested']);

const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

const MONTHS_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

function dayKey(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const dd = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${dd}`;
}

/** "2026-08-06" → "6 Aug". */
function formatDayShort(key: string): string {
  const [, m, d] = key.split('-').map(Number);
  return `${d} ${MONTHS_SHORT[(m ?? 1) - 1]}`;
}

/** "2026-08-06" → "6 August". */
function formatDayFull(key: string): string {
  const [, m, d] = key.split('-').map(Number);
  return `${d} ${MONTHS_FULL[(m ?? 1) - 1]}`;
}

/**
 * The metrics poller rolls both platforms into one assignment, so the only
 * platform signal a creator row carries is the live post URL.
 */
function platformFromUrl(url: string | null): string | null {
  if (url === null) return null;
  const u = url.toLowerCase();
  if (u.includes('tiktok')) return 'tiktok';
  if (u.includes('instagram')) return 'instagram';
  return null;
}

export default function PostsScreen() {
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

  const newestFirst = useMemo(
    () =>
      [...assignments].sort((a, b) =>
        a.scheduled_date === b.scheduled_date
          ? b.slot_index - a.slot_index
          : b.scheduled_date.localeCompare(a.scheduled_date),
      ),
    [assignments],
  );

  const dayAssignments = byDay.get(selectedKey) ?? [];
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

  const renderRow = (a: AssignmentWithBrief, timeLabel: string) => {
    const metrics = parseAssignmentMetrics(a.metrics);
    const canRecord = TODO_STATUSES.has(a.status);
    return (
      <PostRow
        key={a.id}
        platform={platformFromUrl(a.post_url)}
        time={timeLabel}
        title={a.briefs.title}
        views={metrics.views ?? 0}
        likes={metrics.likes ?? 0}
        isPhoto={a.briefs.format === 'photo_carousel'}
        status={a.status}
        showMetrics={DONE_STATUSES.has(a.status)}
        onPress={() => openAssignment(a)}
        actionLabel={
          canRecord
            ? a.briefs.format === 'photo_carousel'
              ? 'Create'
              : 'Record'
            : undefined
        }
        actionIcon={a.briefs.format === 'photo_carousel' ? 'images' : 'video'}
        onAction={canRecord ? () => recordAssignment(a) : undefined}
      />
    );
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>Posts</Text>
        <View style={styles.toggle}>
          <Segmented options={['Calendar', 'List']} value={view} onChange={setView} />
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
          <>
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
            <View style={styles.dayHeader}>
              <Text style={styles.dayLabel}>
                {selectedKey === todayKey ? 'Today' : formatDayFull(selectedKey)}
              </Text>
              <Text style={styles.dayCount}>
                {`${dayAssignments.length} ${dayAssignments.length === 1 ? 'post' : 'posts'}`}
              </Text>
            </View>
            {loading ? (
              <>
                <SkeletonCard height={96} radius={16} />
                <SkeletonCard height={96} radius={16} />
              </>
            ) : dayAssignments.length === 0 ? (
              <EmptyState
                icon="calendar-days"
                title="Nothing this day"
                body="Posts land here when the weekly campaign drops."
                compact
              />
            ) : (
              dayAssignments.map((a) => renderRow(a, `Post ${a.slot_index + 1}`))
            )}
          </>
        ) : loading ? (
          <>
            <SkeletonCard height={96} radius={16} />
            <SkeletonCard height={96} radius={16} />
            <SkeletonCard height={96} radius={16} />
          </>
        ) : newestFirst.length === 0 ? (
          <EmptyState
            icon="layout-list"
            title="No posts yet"
            body="Posts land here when the weekly campaign drops."
          />
        ) : (
          newestFirst.map((a) => renderRow(a, formatDayShort(a.scheduled_date)))
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
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  dayLabel: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.3,
    color: color.ink,
  },
  dayCount: {
    fontSize: 12,
    fontWeight: '600',
    color: color.slate400,
  },
});
