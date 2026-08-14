import { useEffect, useMemo, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { LayoutGrid } from 'lucide-react-native';

import { MonthGrid } from '../../../components/creator/MonthGrid';
import { PostRow } from '../../../components/creator/PostRow';
import {
  fetchCampaignNames,
  groupWeeks,
  isPostedStatus,
  shortDateLabel,
  viralityTopPercents,
  weekName,
  INSTAGRAM_SHARE,
  TIKTOK_SHARE,
  type CreatorWeek,
} from '../../../components/creator/posts-shared';
import { Screen } from '../../../components/layout/Screen';
import { PostsSkeleton } from '../../../components/states';
import { Dropdown } from '../../../components/ui/Dropdown';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Icon, type IconName } from '../../../components/ui/Icon';
import { PressableScale } from '../../../components/ui/PressableScale';
import {
  dayKey,
  slotTimeLabel,
  statusDotColor,
  useCreatorQueue,
} from '../../../lib/creator-queue';
import { formatCount } from '../../../lib/earnings';
import type { AssignmentWithBrief } from '../../../lib/tasks-api';
import { parseAssignmentMetrics } from '../../../lib/tasks-api';
import { color, radius, shadow, space, type } from '../../../theme/tokens';

type PostsView = 'calendar' | 'briefs' | 'list';
type SortKey = 'newest' | 'virality' | 'likes' | 'views';

const SORT_OPTIONS: Array<{ label: string; value: SortKey }> = [
  { label: 'Newest', value: 'newest' },
  { label: 'Virality', value: 'virality' },
  { label: 'Likes', value: 'likes' },
  { label: 'Views', value: 'views' },
];

const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

function ViewToggle({
  view,
  onChange,
}: {
  view: PostsView;
  onChange: (v: PostsView) => void;
}) {
  const items: Array<{ key: PostsView; icon: IconName | 'layout-grid'; label: string }> = [
    { key: 'calendar', icon: 'calendar-days', label: 'Calendar view' },
    { key: 'briefs', icon: 'layout-grid', label: 'Briefs view' },
    { key: 'list', icon: 'layout-list', label: 'List view' },
  ];
  return (
    <View style={styles.toggleTrack}>
      {items.map((item) => {
        const active = item.key === view;
        const tint = active ? color.ink : color.slate400;
        return (
          <PressableScale
            key={item.key}
            accessibilityRole="button"
            accessibilityLabel={item.label}
            accessibilityState={{ selected: active }}
            onPress={() => onChange(item.key)}
            style={[styles.toggleItem, active && [styles.toggleItemActive, shadow.shadowCard]]}
          >
            {item.icon === 'layout-grid' ? (
              <LayoutGrid size={18} color={tint} strokeWidth={2} />
            ) : (
              <Icon name={item.icon} size={18} color={tint} />
            )}
          </PressableScale>
        );
      })}
    </View>
  );
}

function WeekPill({ status }: { status: CreatorWeek['status'] }) {
  const paid = status === 'paid';
  const label = status === 'this' ? 'This week' : paid ? 'Paid' : 'Upcoming';
  const fg = paid ? color.green : color.blue700;
  const bg = paid ? color.greenSoft : color.blue100;
  return (
    <View style={[styles.weekPill, { backgroundColor: bg }]}>
      <View style={[styles.weekPillDot, { backgroundColor: fg }]} />
      <Text style={[styles.weekPillText, { color: fg }]}>{label}</Text>
    </View>
  );
}

export default function PostsScreen() {
  const router = useRouter();
  const { assignments, loading, refetch, assignmentsForDate, changesRequested } =
    useCreatorQueue();

  const [view, setView] = useState<PostsView>('calendar');
  const [platforms, setPlatforms] = useState({ tiktok: true, instagram: true });
  const [sort, setSort] = useState<SortKey>('newest');
  const [refreshing, setRefreshing] = useState(false);
  const [cursor, setCursor] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [selectedKey, setSelectedKey] = useState(dayKey(new Date()));
  const [campaignNames, setCampaignNames] = useState<Map<string, string>>(
    new Map(),
  );

  const share =
    (platforms.tiktok ? TIKTOK_SHARE : 0) +
    (platforms.instagram ? INSTAGRAM_SHARE : 0);
  const rowPlatform: 'tiktok' | 'instagram' =
    !platforms.tiktok && platforms.instagram ? 'instagram' : 'tiktok';

  const togglePlatform = (key: 'tiktok' | 'instagram') => {
    setPlatforms((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      // At least one platform stays active; every post lives on both.
      if (!next.tiktok && !next.instagram) return prev;
      return next;
    });
  };

  const weeks = useMemo(() => groupWeeks(assignments), [assignments]);
  const topPercents = useMemo(
    () => viralityTopPercents(assignments),
    [assignments],
  );

  useEffect(() => {
    const ids = [
      ...new Set(
        assignments
          .map((a) => a.campaign_id)
          .filter((id): id is string => id !== null),
      ),
    ];
    if (ids.length === 0) return;
    let cancelled = false;
    fetchCampaignNames(ids)
      .then((names) => {
        if (!cancelled) setCampaignNames(names);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [assignments]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const monthPrefix = `${year}-${`${month + 1}`.padStart(2, '0')}`;

  const dotsByDay = useMemo(() => {
    const out: Record<number, string[]> = {};
    for (const a of assignments) {
      if (!a.scheduled_date.startsWith(monthPrefix)) continue;
      const day = Number(a.scheduled_date.slice(8, 10));
      (out[day] ??= []).push(statusDotColor(a.status));
    }
    return out;
  }, [assignments, monthPrefix]);

  const selectedDayNumber = Number(selectedKey.slice(8, 10));
  const dayItems = assignmentsForDate(selectedKey);
  const selectedDate = new Date(
    Number(selectedKey.slice(0, 4)),
    Number(selectedKey.slice(5, 7)) - 1,
    selectedDayNumber,
  );
  const dayHeading =
    `${WEEKDAYS[selectedDate.getDay()]} ${selectedDayNumber}`.toUpperCase();

  const listItems = useMemo(() => {
    const items = [...assignments];
    const views = (a: AssignmentWithBrief) =>
      parseAssignmentMetrics(a.metrics).views ?? 0;
    const likes = (a: AssignmentWithBrief) =>
      parseAssignmentMetrics(a.metrics).likes ?? 0;
    switch (sort) {
      case 'newest':
        return items.sort((a, b) =>
          a.scheduled_date === b.scheduled_date
            ? b.slot_index - a.slot_index
            : b.scheduled_date.localeCompare(a.scheduled_date),
        );
      case 'likes':
        return items.sort((a, b) => likes(b) - likes(a));
      case 'views':
        return items.sort((a, b) => views(b) - views(a));
      case 'virality':
        return items.sort(
          (a, b) =>
            (topPercents.get(a.id) ?? 101) - (topPercents.get(b.id) ?? 101) ||
            views(b) - views(a),
        );
    }
  }, [assignments, sort, topPercents]);

  const openRow = (a: AssignmentWithBrief) => {
    if (isPostedStatus(a.status)) {
      router.push(`/(creator)/posts/${a.id}` as Href);
    } else {
      router.push(`/(creator)/assignment/${a.id}` as Href);
    }
  };

  const renderRow = (a: AssignmentWithBrief, withDate: boolean) => {
    const m = parseAssignmentMetrics(a.metrics);
    return (
      <PostRow
        key={a.id}
        title={a.briefs.title}
        isPhoto={a.briefs.format === 'photo_carousel'}
        time={slotTimeLabel(a.slot_index)}
        date={withDate ? shortDateLabel(a.scheduled_date) : undefined}
        platform={rowPlatform}
        views={Math.round((m.views ?? 0) * share)}
        likes={Math.round((m.likes ?? 0) * share)}
        topPercent={topPercents.get(a.id)}
        status={a.status}
        onPress={() => openRow(a)}
      />
    );
  };

  const firstChange = changesRequested[0];

  return (
    <Screen scroll={false} bg={color.offWhite} contentStyle={styles.screenContent}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Posts</Text>
        <ViewToggle view={view} onChange={setView} />
      </View>

      <View style={styles.pillsRow}>
        {(
          [
            { key: 'instagram', icon: 'at-sign', label: 'Instagram' },
            { key: 'tiktok', icon: 'music-2', label: 'TikTok' },
          ] as const
        ).map((p) => {
          const active = platforms[p.key];
          return (
            <PressableScale
              key={p.key}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => togglePlatform(p.key)}
              style={[styles.accountPill, active && styles.accountPillActive]}
            >
              <Icon
                name={p.icon}
                size={15}
                color={active ? color.blue600 : color.slate500}
              />
              <Text
                style={[
                  styles.accountPillText,
                  { color: active ? color.blue600 : color.slate500 },
                ]}
              >
                {p.label}
              </Text>
            </PressableScale>
          );
        })}
      </View>

      {firstChange !== undefined && (
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Changes requested"
          onPress={() =>
            router.push(`/(creator)/posts/changes/${firstChange.id}` as Href)
          }
          style={styles.changesBanner}
        >
          <Icon name="circle-alert" size={19} color={color.amber} />
          <View style={styles.changesBody}>
            <Text style={styles.changesTitle}>Changes requested</Text>
            <Text style={styles.changesSub} numberOfLines={1}>
              {firstChange.briefs.title}
            </Text>
          </View>
          <Icon name="chevron-right" size={17} color={color.amber} />
        </PressableScale>
      )}

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.column}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void refetch().finally(() => setRefreshing(false));
            }}
          />
        }
      >
        {loading ? (
          <PostsSkeleton />
        ) : view === 'calendar' ? (
          <>
            <MonthGrid
              year={year}
              month={month}
              dotsByDay={dotsByDay}
              selectedDay={
                selectedKey.startsWith(monthPrefix) ? selectedDayNumber : 0
              }
              onSelectDay={(day) =>
                setSelectedKey(dayKey(new Date(year, month, day)))
              }
              onPrevMonth={() =>
                setCursor(new Date(year, month - 1, 1))
              }
              onNextMonth={() =>
                setCursor(new Date(year, month + 1, 1))
              }
            />
            <Text style={styles.sectionHeading}>{dayHeading}</Text>
            {dayItems.length === 0 ? (
              <EmptyState
                icon="calendar-days"
                title="Nothing this day"
                body="Pick another day, or wait for the next campaign drop."
                compact
              />
            ) : (
              dayItems.map((a) => renderRow(a, false))
            )}
          </>
        ) : view === 'briefs' ? (
          weeks.length === 0 ? (
            <EmptyState
              icon="layout-list"
              title="No posts yet"
              body="Head to Home when your first post lands."
            />
          ) : (
            [...weeks].reverse().map((week) => (
              <PressableScale
                key={week.startKey}
                accessibilityRole="button"
                onPress={() =>
                  router.push(`/(creator)/posts/week/${week.startKey}` as Href)
                }
                style={[styles.weekCard, shadow.shadowCard]}
              >
                <View style={styles.weekTopRow}>
                  <Text style={styles.weekMicro}>
                    {`WEEK ${week.index} · ${week.rangeLabel.toUpperCase()}`}
                  </Text>
                  <WeekPill status={week.status} />
                </View>
                <Text style={styles.weekName} numberOfLines={1}>
                  {weekName(week, campaignNames)}
                </Text>
                <View style={styles.weekStatsRow}>
                  <Text style={styles.weekStat}>
                    {`${week.items.length} posts`}
                  </Text>
                  <View style={styles.weekStatGroup}>
                    <Icon name="eye" size={13} color={color.slate500} />
                    <Text style={styles.weekStat}>
                      {formatCount(Math.round(week.views * share))}
                    </Text>
                  </View>
                  <View style={styles.weekStatGroup}>
                    <Icon name="zap" size={13} color={color.slate500} />
                    <Text style={styles.weekStat}>
                      {formatCount(Math.round(week.likes * share))}
                    </Text>
                  </View>
                  <Text style={styles.weekEarned}>
                    {`$${(week.earned * share).toFixed(2)}`}
                  </Text>
                  <Icon name="chevron-right" size={16} color={color.slate400} />
                </View>
              </PressableScale>
            ))
          )
        ) : (
          <>
            <View style={styles.sortRow}>
              <Dropdown<SortKey>
                options={SORT_OPTIONS}
                value={sort}
                onChange={setSort}
                labelPrefix="Sort"
              />
            </View>
            {listItems.length === 0 ? (
              <EmptyState
                icon="layout-list"
                title="No posts yet"
                body="Head to Home when your first post lands."
              />
            ) : (
              listItems.map((a) => renderRow(a, true))
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
    gap: space[4],
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: type.size.title,
    lineHeight: type.size.title * type.leading.title,
    letterSpacing: type.tracking.title,
    fontWeight: type.weight.bold,
    color: color.ink,
  },
  toggleTrack: {
    flexDirection: 'row',
    gap: 2,
    padding: 3,
    borderRadius: radius.pill,
    backgroundColor: color.fillQuiet,
  },
  toggleItem: {
    width: 44,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleItemActive: {
    backgroundColor: color.white,
  },
  pillsRow: {
    flexDirection: 'row',
    gap: space[3],
  },
  accountPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    height: 42,
    borderRadius: radius.pill,
    backgroundColor: color.fillQuiet,
  },
  accountPillActive: {
    backgroundColor: color.blue100,
  },
  accountPillText: {
    fontSize: type.size.meta,
    fontWeight: type.weight.bold,
  },
  changesBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    paddingVertical: space[3],
    paddingHorizontal: space[4],
    borderRadius: radius.md,
    backgroundColor: color.amberSoft,
  },
  changesBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  changesTitle: {
    fontSize: 13.5,
    fontWeight: type.weight.bold,
    color: color.amber,
  },
  changesSub: {
    fontSize: type.size.label,
    color: color.slate500,
  },
  column: {
    gap: space[3],
    paddingBottom: 110,
  },
  sectionHeading: {
    fontSize: type.size.label,
    fontWeight: type.weight.heavy,
    letterSpacing: type.tracking.label,
    color: color.slate400,
    paddingTop: space[1],
  },
  weekCard: {
    gap: 8,
    padding: space.cardPad,
    borderRadius: radius.lg,
    backgroundColor: color.white,
    borderWidth: 1,
    borderColor: color.line,
  },
  weekTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space[2],
  },
  weekMicro: {
    flexShrink: 1,
    fontSize: type.size.micro11,
    fontWeight: type.weight.heavy,
    letterSpacing: type.tracking.label,
    color: color.slate400,
  },
  weekPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 4,
    paddingHorizontal: 9,
    borderRadius: radius.pill,
  },
  weekPillDot: {
    width: 6,
    height: 6,
    borderRadius: radius.pill,
  },
  weekPillText: {
    fontSize: type.size.micro11,
    fontWeight: type.weight.bold,
  },
  weekName: {
    fontSize: type.size.action,
    fontWeight: type.weight.bold,
    letterSpacing: -0.3,
    color: color.ink,
  },
  weekStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  weekStatGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  weekStat: {
    fontSize: type.size.chip,
    fontWeight: type.weight.semibold,
    color: color.slate500,
  },
  weekEarned: {
    marginLeft: 'auto',
    fontSize: type.size.meta,
    fontWeight: type.weight.heavy,
    color: color.green,
  },
  sortRow: {
    zIndex: 30,
  },
});
