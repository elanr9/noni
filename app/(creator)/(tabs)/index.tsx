import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Animated,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PostCard, formatViews } from '../../../components/creator/PostCard';
import { PostPager, type PagerItem } from '../../../components/creator/PostPager';
import { SwapSheet } from '../../../components/creator/SwapSheet';
import { WeekStrip, type WeekDay } from '../../../components/creator/WeekStrip';
import { Dropdown } from '../../../components/ui/Dropdown';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Icon } from '../../../components/ui/Icon';
import { MediaCard } from '../../../components/ui/MediaCard';
import { PressableScale } from '../../../components/ui/PressableScale';
import { Segmented } from '../../../components/ui/Segmented';
import { SkeletonCard } from '../../../components/ui/Skeleton';
import { Wordmark } from '../../../components/ui/Wordmark';
import { useAuth } from '../../../lib/auth';
import { getCompany } from '../../../lib/onboarding';
import {
  DEFAULT_STREAK_MILESTONES,
  fetchMyStreak,
  parseStreakMilestones,
  streakBonusText,
  type StreakMilestone,
} from '../../../lib/streaks';
import {
  labelTrend,
  listMyTasks,
  listTrends,
  swapTaskTrend,
  type TaskWithTrend,
  type TrendItem,
} from '../../../lib/tasks-api';
import { color, motion, shadow } from '../../../theme/tokens';

const DOW_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const;
const TODO_STATUSES = new Set(['assigned', 'changes_requested']);
const DONE_STATUSES = new Set(['posted', 'approved']);

type TrendFilter = 'all' | 'reel' | 'slideshow';

const FILTER_OPTIONS: { label: string; value: TrendFilter }[] = [
  { label: 'Everything', value: 'all' },
  { label: 'Reels', value: 'reel' },
  { label: 'Slideshows', value: 'slideshow' },
];

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

function firstTodoIndex(tasks: TaskWithTrend[]): number {
  const index = tasks.findIndex((t) => TODO_STATUSES.has(t.status));
  return index === -1 ? 0 : index;
}

function trendTitle(trend: TrendItem): string {
  return trend.hook ?? trend.why_it_works ?? 'Trending post';
}

function trendMeta(trend: TrendItem): string | undefined {
  const handle =
    trend.author_handle !== null ? `@${trend.author_handle.replace(/^@/, '')}` : null;
  const views = trend.views !== null ? `${formatViews(trend.views)} views` : null;
  if (handle !== null && views !== null) return `${handle} · ${views}`;
  return handle ?? views ?? undefined;
}

export default function HomeScreen() {
  const { profile } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [tasks, setTasks] = useState<TaskWithTrend[]>([]);
  const [trends, setTrends] = useState<TrendItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [segment, setSegment] = useState(0);
  const [selectedKey, setSelectedKey] = useState(dayKey(new Date()));
  const [postIndex, setPostIndex] = useState(0);
  const [trendFilter, setTrendFilter] = useState<TrendFilter>('all');
  const [swapOpen, setSwapOpen] = useState(false);
  const [streak, setStreak] = useState(0);
  const [milestones, setMilestones] = useState<StreakMilestone[]>(
    DEFAULT_STREAK_MILESTONES,
  );

  const [toast, setToast] = useState<string | null>(null);
  const toastAnim = useRef(new Animated.Value(0)).current;
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback(
    (message: string) => {
      if (toastTimer.current !== null) clearTimeout(toastTimer.current);
      setToast(message);
      Animated.timing(toastAnim, {
        toValue: 1,
        duration: motion.base,
        easing: motion.easeOut,
        useNativeDriver: true,
      }).start();
      toastTimer.current = setTimeout(() => {
        Animated.timing(toastAnim, {
          toValue: 0,
          duration: motion.base,
          easing: motion.easeOut,
          useNativeDriver: true,
        }).start(({ finished }) => {
          if (finished) setToast(null);
        });
      }, 2400);
    },
    [toastAnim],
  );

  const load = useCallback(async () => {
    if (!profile?.id) return;
    try {
      const [nextTasks, nextTrends, streakRow, company] = await Promise.all([
        listMyTasks(profile.id),
        profile.company_id
          ? listTrends(profile.company_id).catch(() => [] as TrendItem[])
          : Promise.resolve([] as TrendItem[]),
        profile.company_id
          ? fetchMyStreak(profile.company_id, profile.id).catch(() => null)
          : Promise.resolve(null),
        profile.company_id
          ? getCompany(profile.company_id).catch(() => null)
          : Promise.resolve(null),
      ]);
      setTasks(nextTasks);
      setTrends(nextTrends);
      setStreak(streakRow?.current_streak ?? 0);
      if (company) setMilestones(parseStreakMilestones(company.settings));
    } catch {
      // Pull to refresh retries; keep whatever is on screen.
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [profile?.id, profile?.company_id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const byDay = useMemo(() => {
    const map = new Map<string, TaskWithTrend[]>();
    for (const task of tasks) {
      if (task.due_date === null) continue;
      const list = map.get(task.due_date) ?? [];
      list.push(task);
      map.set(task.due_date, list);
    }
    return map;
  }, [tasks]);

  const todayKey = dayKey(new Date());

  const weekDays = useMemo<WeekDay[]>(() => {
    const monday = mondayOf(new Date());
    return DOW_LETTERS.map((dow, i) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + i);
      const key = dayKey(date);
      const dayTasks = byDay.get(key) ?? [];
      return {
        key,
        dow,
        dayNumber: date.getDate(),
        postCount: dayTasks.length,
        done:
          dayTasks.length > 0 && dayTasks.every((t) => DONE_STATUSES.has(t.status)),
        isToday: key === todayKey,
      };
    });
  }, [byDay, todayKey]);

  const dayTasks = useMemo(
    () => (byDay.get(selectedKey) ?? []).slice(0, 3),
    [byDay, selectedKey],
  );
  const safeIndex = Math.min(postIndex, Math.max(0, dayTasks.length - 1));
  const selectedTask = dayTasks.length > 0 ? dayTasks[safeIndex] : undefined;

  const pagerItems = useMemo<PagerItem[]>(
    () =>
      dayTasks.map((task, i) => ({
        id: task.id,
        label: `Post ${i + 1}`,
        status: task.status,
      })),
    [dayTasks],
  );

  const todayTodoCount = (byDay.get(todayKey) ?? []).filter((t) =>
    TODO_STATUSES.has(t.status),
  ).length;
  const firstName = profile?.full_name?.split(' ')[0] ?? 'creator';
  const greetingSub =
    todayTodoCount > 0 ? `${todayTodoCount} left to shoot today.` : 'Nothing queued yet.';

  const selectDay = (key: string) => {
    setSelectedKey(key);
    setPostIndex(firstTodoIndex((byDay.get(key) ?? []).slice(0, 3)));
  };

  const openTask = (task: TaskWithTrend) => {
    router.push(`/(creator)/task/${task.id}`);
  };

  const recordTask = (task: TaskWithTrend) => {
    if (task.format === 'video') {
      router.push(`/(creator)/record/${task.id}`);
    } else {
      router.push(`/(creator)/task/${task.id}`);
    }
  };

  const pickSwap = async (trend: TrendItem) => {
    if (selectedTask === undefined) return;
    setSwapOpen(false);
    try {
      const updated = await swapTaskTrend(selectedTask.id, trend);
      setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      showToast(`Swapped in "${updated.title}".`);
    } catch {
      showToast('Could not swap that in. Try again.');
    }
  };

  const filteredTrends = useMemo(() => {
    if (trendFilter === 'reel') return trends.filter((t) => t.format !== 'carousel');
    if (trendFilter === 'slideshow') {
      return trends.filter((t) => t.format === 'carousel');
    }
    return trends;
  }, [trends, trendFilter]);
  const trendRows = useMemo(() => {
    const rows: TrendItem[][] = [];
    for (let i = 0; i < filteredTrends.length; i += 2) {
      rows.push(filteredTrends.slice(i, i + 2));
    }
    return rows;
  }, [filteredTrends]);

  // Creator thumbs feed the same label store that trains the gate.
  const rateTrend = async (trend: TrendItem, label: 'keep' | 'kill') => {
    const next = trend.label === label ? null : label;
    setTrends((prev) =>
      prev.map((t) => (t.id === trend.id ? { ...t, label: next } : t)),
    );
    try {
      await labelTrend(trend.id, next);
      if (next !== null) {
        showToast(next === 'keep' ? 'More like this coming.' : 'Got it, less of that.');
      }
    } catch {
      setTrends((prev) =>
        prev.map((t) => (t.id === trend.id ? { ...t, label: trend.label } : t)),
      );
    }
  };

  const refreshControl = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        void load();
      }}
    />
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.headerRow}>
        <Wordmark size={19} />
        <View>
          <Icon name="bell" size={23} color={color.ink} />
          <View style={styles.bellDot} />
        </View>
      </View>

      <View style={styles.segmentedBlock}>
        <Segmented
          options={['Calendar', 'Inspiration']}
          value={segment}
          onChange={setSegment}
        />
      </View>

      {segment === 0 ? (
        <ScrollView
          contentContainerStyle={styles.calendarGrow}
          alwaysBounceVertical
          showsVerticalScrollIndicator={false}
          refreshControl={refreshControl}
        >
          <View style={styles.calendarColumn}>
            <View style={styles.greetingRow}>
              <View style={styles.greeting}>
                <Text style={styles.greetingTitle}>Welcome back, {firstName}.</Text>
                <Text style={styles.greetingSub}>{greetingSub}</Text>
              </View>
              <PressableScale
                style={styles.streakPill}
                onPress={() => showToast(streakBonusText(streak, milestones))}
              >
                <Icon name="flame" size={16} color={color.amber} />
                <Text style={styles.streakCount}>{streak}</Text>
              </PressableScale>
            </View>

            <WeekStrip days={weekDays} selectedKey={selectedKey} onSelect={selectDay} />

            {loading ? (
              <>
                <SkeletonCard height={34} radius={999} />
                <SkeletonCard radius={24} style={styles.frame} />
              </>
            ) : (
              <>
                {pagerItems.length > 0 && (
                  <PostPager
                    items={pagerItems}
                    selectedIndex={safeIndex}
                    onSelect={setPostIndex}
                  />
                )}
                <View style={styles.frame}>
                  {selectedTask !== undefined ? (
                    <PostCard
                      task={selectedTask}
                      showSwap={
                        selectedKey === todayKey && TODO_STATUSES.has(selectedTask.status)
                      }
                      onOpen={() => openTask(selectedTask)}
                      onRecord={() => recordTask(selectedTask)}
                      onSwap={() => setSwapOpen(true)}
                    />
                  ) : (
                    <View style={styles.emptyWrap}>
                      <EmptyState
                        icon="sparkles"
                        title="Nothing queued today"
                        body="Your next batch lands tonight. Pull one from Inspiration if you want to shoot now."
                        actionLabel="Open Inspiration"
                        onAction={() => setSegment(1)}
                        compact
                      />
                    </View>
                  )}
                </View>
              </>
            )}
          </View>
        </ScrollView>
      ) : (
        <ScrollView
          contentContainerStyle={styles.inspirationColumn}
          showsVerticalScrollIndicator={false}
          refreshControl={refreshControl}
        >
          <Dropdown
            options={FILTER_OPTIONS}
            value={trendFilter}
            onChange={setTrendFilter}
          />
          {filteredTrends.length === 0 ? (
            <EmptyState
              icon="sparkles"
              title="No ideas yet"
              body="New trends land here as they come in. Check back soon."
            />
          ) : (
            trendRows.map((row) => (
              <View key={row[0].id} style={styles.gridRow}>
                {row.map((trend) => {
                  const slides = Array.isArray(trend.image_urls)
                    ? trend.image_urls.length
                    : 0;
                  return (
                    <View key={trend.id} style={styles.gridCell}>
                      <MediaCard
                        variant="tile"
                        mediaHeight={150}
                        title={trendTitle(trend)}
                        meta={trendMeta(trend)}
                        format={trend.format === 'carousel' ? 'slideshow' : 'reel'}
                        duration={
                          trend.format === 'carousel' && slides > 0
                            ? `${slides} slides`
                            : undefined
                        }
                        thumbnail={trend.cover_url ?? undefined}
                      />
                      <View style={styles.rateRow}>
                        <PressableScale
                          accessibilityRole="button"
                          accessibilityLabel="More like this"
                          style={[
                            styles.rateBtn,
                            trend.label === 'keep' && styles.rateBtnKeep,
                          ]}
                          onPress={() => void rateTrend(trend, 'keep')}
                        >
                          <Icon
                            name="thumbs-up"
                            size={15}
                            color={trend.label === 'keep' ? color.white : color.ink}
                          />
                        </PressableScale>
                        <PressableScale
                          accessibilityRole="button"
                          accessibilityLabel="Less like this"
                          style={[
                            styles.rateBtn,
                            trend.label === 'kill' && styles.rateBtnKill,
                          ]}
                          onPress={() => void rateTrend(trend, 'kill')}
                        >
                          <Icon
                            name="thumbs-down"
                            size={15}
                            color={trend.label === 'kill' ? color.white : color.ink}
                          />
                        </PressableScale>
                      </View>
                    </View>
                  );
                })}
                {row.length === 1 && <View style={styles.gridCell} />}
              </View>
            ))
          )}
        </ScrollView>
      )}

      <SwapSheet
        visible={swapOpen}
        slotLabel={`Post ${safeIndex + 1}`}
        format={selectedTask?.format === 'photo_carousel' ? 'photo_carousel' : 'video'}
        trends={trends}
        onPick={(trend) => {
          void pickSwap(trend);
        }}
        onClose={() => setSwapOpen(false)}
      />

      {toast !== null && (
        <Animated.View
          style={[styles.toast, shadow.shadowFloat, { opacity: toastAnim }]}
          pointerEvents="none"
        >
          <Text style={styles.toastText}>{toast}</Text>
        </Animated.View>
      )}
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
    paddingTop: 6,
    paddingHorizontal: 24,
  },
  bellDot: {
    position: 'absolute',
    top: -1,
    right: -1,
    width: 9,
    height: 9,
    borderRadius: 999,
    backgroundColor: color.accent,
    borderWidth: 2,
    borderColor: color.white,
  },
  segmentedBlock: {
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  calendarGrow: {
    flexGrow: 1,
  },
  calendarColumn: {
    flex: 1,
    paddingHorizontal: 24,
    paddingBottom: 96,
    gap: 10,
  },
  greetingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  greeting: {
    flex: 1,
    paddingRight: 12,
  },
  streakPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: color.amberSoft,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  streakCount: {
    fontSize: 15,
    fontWeight: '700',
    color: color.ink,
  },
  greetingTitle: {
    fontSize: 24,
    lineHeight: 27.6,
    fontWeight: '700',
    letterSpacing: -0.5,
    color: color.ink,
  },
  greetingSub: {
    marginTop: 4,
    fontSize: 14,
    color: color.slate500,
  },
  frame: {
    flex: 1,
    minHeight: 0,
  },
  emptyWrap: {
    flex: 1,
    justifyContent: 'center',
  },
  inspirationColumn: {
    paddingHorizontal: 24,
    paddingBottom: 110,
    gap: 12,
  },
  gridRow: {
    flexDirection: 'row',
    gap: 10,
  },
  gridCell: {
    flex: 1,
    gap: 6,
  },
  rateRow: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
  },
  rateBtn: {
    width: 34,
    height: 34,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.white,
    borderWidth: 1,
    borderColor: color.line,
  },
  rateBtnKeep: {
    backgroundColor: color.ink,
    borderColor: color.ink,
  },
  rateBtnKill: {
    backgroundColor: color.slate500,
    borderColor: color.slate500,
  },
  toast: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 104,
    backgroundColor: color.ink,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  toastText: {
    color: color.white,
    fontSize: 14,
    fontWeight: '600',
  },
});
