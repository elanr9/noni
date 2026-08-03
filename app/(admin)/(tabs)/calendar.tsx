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

import {
  CalendarCell,
  CELL_WIDTH,
  type CalendarCellItem,
} from '../../../components/admin/CalendarCell';
import { Icon } from '../../../components/ui/Icon';
import { PressableScale } from '../../../components/ui/PressableScale';
import { useAuth } from '../../../lib/auth';
import {
  listCreators,
  listWeekAssignments,
  type AssignmentQueueItem,
} from '../../../lib/admin-api';
import type { ContentFormat, Creator } from '../../../lib/admin-review-types';
import type { TaskStatus } from '../../../lib/tasks';
import { color, radius, space, type } from '../../../theme/tokens';

const CREATOR_COL = 72;
const DAY_GAP = 8;
const ROW_GAP = 10;
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

function startOfWeek(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  return copy;
}

function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function weekLabel(monday: Date): string {
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  return `Week of ${monday.getDate()} ${months[monday.getMonth()]}`;
}

function asFormat(raw: string | null | undefined): ContentFormat {
  return raw === 'photo_carousel' ? 'photo_carousel' : 'video';
}

function creatorFromProfile(p: {
  id: string;
  full_name: string | null;
}): Creator {
  const name = p.full_name?.trim() || 'Creator';
  return { id: p.id, name, initial: name.charAt(0).toUpperCase() };
}

export default function CalendarScreen() {
  const { profile } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [assignments, setAssignments] = useState<AssignmentQueueItem[]>([]);
  const [creators, setCreators] = useState<Creator[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!profile) return;
    try {
      const start = isoDate(weekStart);
      const end = isoDate(addDays(weekStart, 6));
      const [a, c] = await Promise.all([
        listWeekAssignments(start, end),
        listCreators(profile.company_id),
      ]);
      setAssignments(a);
      setCreators(
        c.filter((p) => p.role === 'creator').map(creatorFromProfile),
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [profile, weekStart]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  const todayIso = isoDate(new Date());

  const grid = useMemo(() => {
    const byKey = new Map<string, CalendarCellItem[]>();
    for (const a of assignments) {
      const key = `${a.creator_id}|${a.scheduled_date}`;
      const items = byKey.get(key) ?? [];
      items.push({
        id: a.id,
        title: a.briefs?.title ?? 'Brief',
        format: asFormat(a.briefs?.format),
        status: a.status as TaskStatus,
        onPress:
          a.status === 'submitted'
            ? () => router.push(`/(admin)/review/${a.id}`)
            : undefined,
      });
      byKey.set(key, items);
    }
    return creators.map((creator) => ({
      creator,
      cells: days.map((day) => ({
        iso: isoDate(day),
        items: byKey.get(`${creator.id}|${isoDate(day)}`) ?? [],
      })),
    }));
  }, [assignments, creators, days, router]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 6 }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
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
        <View style={styles.titleRow}>
          <Text style={styles.h1}>Calendar</Text>
          {assignments.length > 0 ? (
            <View style={styles.countPill}>
              <Text style={styles.countPillText}>
                {assignments.length} posts
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.weekRow}>
          <Text style={styles.weekLabel}>
            {weekLabel(weekStart)}
            {creators.length > 0 ? ` · ${creators.length} creators` : ''}
          </Text>
          <View style={styles.weekNav}>
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="Previous week"
              onPress={() => setWeekStart((d) => addDays(d, -7))}
              style={styles.navBtn}
            >
              <Icon name="chevron-left" size={18} color={color.slate500} />
            </PressableScale>
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="Next week"
              onPress={() => setWeekStart((d) => addDays(d, 7))}
              style={styles.navBtn}
            >
              <Icon name="chevron-right" size={18} color={color.slate500} />
            </PressableScale>
          </View>
        </View>

        {loading ? (
          <Text style={styles.loading}>Loading calendar…</Text>
        ) : creators.length === 0 ? (
          <Text style={styles.loading}>
            No creators yet. Invite someone from Settings.
          </Text>
        ) : assignments.length === 0 ? (
          <Text style={styles.loading}>
            No posts scheduled this week. Publish a campaign from Create.
          </Text>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.gridPad}
          >
            <View>
              <View style={styles.dayHeaderRow}>
                <View style={{ width: CREATOR_COL }} />
                {days.map((day, i) => {
                  const iso = isoDate(day);
                  const isToday = iso === todayIso;
                  return (
                    <View key={iso} style={styles.dayHeader}>
                      <Text
                        style={[styles.dayHeaderText, isToday && styles.dayToday]}
                      >
                        {DAY_NAMES[i]} {day.getDate()}
                      </Text>
                    </View>
                  );
                })}
              </View>

              {grid.map((row) => (
                <View key={row.creator.id} style={styles.creatorRow}>
                  <View style={styles.creatorCol}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>{row.creator.initial}</Text>
                    </View>
                    <Text numberOfLines={1} style={styles.creatorName}>
                      {row.creator.name}
                    </Text>
                  </View>
                  {row.cells.map((cell) => (
                    <View key={cell.iso} style={styles.cellWrap}>
                      <CalendarCell items={cell.items} />
                    </View>
                  ))}
                </View>
              ))}
            </View>
          </ScrollView>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.offWhite },
  scrollContent: { paddingBottom: 116 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: space.gutter,
    marginTop: 10,
  },
  h1: {
    fontSize: type.size.titleXl,
    lineHeight: type.size.titleXl * type.leading.title,
    fontWeight: '800',
    letterSpacing: type.tracking.title,
    color: color.ink,
  },
  countPill: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    backgroundColor: color.amberSoft,
  },
  countPillText: {
    fontSize: type.size.chip,
    fontWeight: '700',
    color: color.amber,
  },
  weekRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.gutter,
    marginTop: 6,
    marginBottom: 14,
  },
  weekLabel: {
    flex: 1,
    fontSize: type.size.bodySm,
    fontWeight: '600',
    color: color.slate500,
  },
  weekNav: { flexDirection: 'row', gap: 8 },
  navBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: color.fillQuiet,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loading: {
    paddingHorizontal: space.gutter,
    fontSize: type.size.bodySm,
    color: color.slate500,
    fontWeight: '600',
  },
  gridPad: { paddingLeft: 16, paddingRight: space.gutter },
  dayHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: DAY_GAP,
  },
  dayHeader: { width: CELL_WIDTH },
  dayHeaderText: {
    fontSize: type.size.label,
    fontWeight: '700',
    color: color.slate400,
  },
  dayToday: { color: color.ink },
  creatorRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: DAY_GAP,
    marginBottom: ROW_GAP,
  },
  creatorCol: {
    width: CREATOR_COL,
    alignItems: 'flex-start',
    paddingTop: 8,
  },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: color.blue100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: type.size.label,
    fontWeight: '800',
    color: color.blue700,
  },
  creatorName: {
    marginTop: 4,
    fontSize: type.size.label,
    fontWeight: '700',
    color: color.slate500,
    maxWidth: CREATOR_COL - 4,
  },
  cellWrap: { width: CELL_WIDTH },
});
