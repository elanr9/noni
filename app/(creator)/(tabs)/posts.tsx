import { useCallback, useMemo, useState } from 'react';
import {
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useFocusEffect, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MonthGrid } from '../../../components/creator/MonthGrid';
import { PostRow } from '../../../components/creator/PostRow';
import { Dropdown } from '../../../components/ui/Dropdown';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Icon, type IconName } from '../../../components/ui/Icon';
import { PressableScale } from '../../../components/ui/PressableScale';
import { SkeletonCard } from '../../../components/ui/Skeleton';
import { getSocialConnectStatus } from '../../../lib/admin-api';
import { useAuth } from '../../../lib/auth';
import { supabase } from '../../../lib/supabase';
import { listMyPosts } from '../../../lib/tasks-api';
import { color, shadow } from '../../../theme/tokens';

const MONTHS_SHORT = [
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
] as const;

const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

type PostItem = {
  id: string;
  taskId: string;
  title: string;
  platform: string | null;
  postUrl: string | null;
  postedAt: Date | null;
  isPhoto: boolean;
  views: number;
  likes: number;
};

type ViewMode = 'calendar' | 'list';
type SortKey = 'newest' | 'likes' | 'views';

const SORT_OPTIONS: Array<{ label: string; value: SortKey }> = [
  { label: 'Newest', value: 'newest' },
  { label: 'Likes', value: 'likes' },
  { label: 'Views', value: 'views' },
];

function timeLabel(d: Date): string {
  const h = `${d.getHours()}`.padStart(2, '0');
  const m = `${d.getMinutes()}`.padStart(2, '0');
  return `${h}:${m}`;
}

function dateLabel(d: Date): string {
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

function matchesPlatform(item: PostItem, instagram: boolean, tiktok: boolean): boolean {
  const p = (item.platform ?? '').toLowerCase();
  if (p.includes('insta')) return instagram;
  if (p.includes('tiktok')) return tiktok;
  return true;
}

interface AccountPillProps {
  label: string;
  icon: IconName;
  active: boolean;
  disabled: boolean;
  onPress: () => void;
}

function AccountPill({ label, icon, active, disabled, onPress }: AccountPillProps) {
  const fg = active ? color.blue700 : color.slate500;
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.pill,
        active ? styles.pillActive : styles.pillInactive,
        disabled && styles.disabled,
      ]}
    >
      <Icon name={icon} size={14} color={fg} />
      <Text style={[styles.pillText, { color: fg }]}>{label}</Text>
    </PressableScale>
  );
}

export default function PostsScreen() {
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();

  const [view, setView] = useState<ViewMode>('calendar');
  const [sort, setSort] = useState<SortKey>('newest');
  const [instagram, setInstagram] = useState(true);
  const [tiktok, setTiktok] = useState(true);
  const [items, setItems] = useState<PostItem[]>([]);
  const [unlinked, setUnlinked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const today = useMemo(() => new Date(), []);
  const [selectedDay, setSelectedDay] = useState(today.getDate());

  const load = useCallback(async () => {
    if (!profile?.id) return;
    try {
      const [tasks, status] = await Promise.all([
        listMyPosts(profile.id),
        getSocialConnectStatus().catch(() => null),
      ]);

      if (status) {
        const accounts = status.social_accounts ?? {};
        setUnlinked(
          !Object.values(accounts).some((v) =>
            typeof v === 'string' ? v.length > 0 : Boolean(v),
          ),
        );
      }

      const next: PostItem[] = [];
      for (const task of tasks) {
        const format = task.format.toLowerCase();
        const isPhoto =
          format.includes('photo') ||
          format.includes('carousel') ||
          format.includes('slideshow');
        for (const post of task.posts ?? []) {
          const stamp = post.posted_at ?? task.created_at;
          next.push({
            id: post.id,
            taskId: task.id,
            title: task.title,
            platform: post.platform,
            postUrl: post.post_url,
            postedAt: stamp !== null ? new Date(stamp) : null,
            isPhoto,
            views: 0,
            likes: 0,
          });
        }
      }

      if (next.length > 0) {
        const { data } = await supabase
          .from('post_metrics')
          .select('post_id, views, likes, fetched_at')
          .in(
            'post_id',
            next.map((i) => i.id),
          )
          .order('fetched_at', { ascending: false });
        if (data) {
          const seen = new Set<string>();
          for (const metric of data) {
            if (seen.has(metric.post_id)) continue;
            seen.add(metric.post_id);
            const item = next.find((i) => i.id === metric.post_id);
            if (item) {
              item.views = metric.views ?? 0;
              item.likes = metric.likes ?? 0;
            }
          }
        }
      }

      setItems(next);
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

  // None selected falls back to both (§5).
  const none = !instagram && !tiktok;
  const filtered = useMemo(
    () =>
      items.filter((item) =>
        matchesPlatform(item, none ? true : instagram, none ? true : tiktok),
      ),
    [items, instagram, tiktok, none],
  );

  const postCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    for (const item of filtered) {
      const d = item.postedAt;
      if (
        d !== null &&
        d.getFullYear() === today.getFullYear() &&
        d.getMonth() === today.getMonth()
      ) {
        counts[d.getDate()] = (counts[d.getDate()] ?? 0) + 1;
      }
    }
    return counts;
  }, [filtered, today]);

  const dayItems = useMemo(
    () =>
      filtered.filter((item) => {
        const d = item.postedAt;
        return (
          d !== null &&
          d.getFullYear() === today.getFullYear() &&
          d.getMonth() === today.getMonth() &&
          d.getDate() === selectedDay
        );
      }),
    [filtered, today, selectedDay],
  );

  const sorted = useMemo(() => {
    if (sort === 'newest') return filtered;
    const key = sort === 'likes' ? 'likes' : 'views';
    return [...filtered].sort((a, b) => b[key] - a[key]);
  }, [filtered, sort]);

  const selectedDate = new Date(today.getFullYear(), today.getMonth(), selectedDay);
  const dayLabel =
    selectedDay === today.getDate()
      ? 'Today'
      : `${DAYS_SHORT[selectedDate.getDay()]} ${dateLabel(selectedDate)}`;

  const openItem = (item: PostItem) => {
    if (item.postUrl !== null) {
      void Linking.openURL(item.postUrl);
    } else {
      router.push({ pathname: '/(creator)/task/[id]', params: { id: item.taskId } });
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

  const renderRow = (item: PostItem, showDate: boolean) => (
    <PostRow
      key={item.id}
      platform={item.platform}
      time={item.postedAt !== null ? timeLabel(item.postedAt) : ''}
      date={showDate && item.postedAt !== null ? dateLabel(item.postedAt) : undefined}
      title={item.title}
      views={item.views}
      likes={item.likes}
      isPhoto={item.isPhoto}
      onPress={() => openItem(item)}
    />
  );

  const pills = (
    <View style={styles.pillsRow}>
      <AccountPill
        label="Instagram"
        icon="at-sign"
        active={instagram || none}
        disabled={unlinked}
        onPress={() => setInstagram((v) => !v)}
      />
      <AccountPill
        label="TikTok"
        icon="music-2"
        active={tiktok || none}
        disabled={unlinked}
        onPress={() => setTiktok((v) => !v)}
      />
    </View>
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Posts</Text>
        <View style={[styles.toggleTrack, unlinked && styles.disabled]}>
          {(
            [
              { mode: 'calendar', icon: 'calendar-days' },
              { mode: 'list', icon: 'layout-list' },
            ] as const
          ).map(({ mode, icon }) => {
            const active = view === mode;
            return (
              <PressableScale
                key={mode}
                accessibilityRole="button"
                accessibilityState={{ selected: active, disabled: unlinked }}
                disabled={unlinked}
                onPress={() => setView(mode)}
                style={[styles.toggleItem, active && [styles.toggleItemActive, shadow.shadowCard]]}
              >
                <Icon name={icon} size={17} color={active ? color.ink : color.slate400} />
              </PressableScale>
            );
          })}
        </View>
      </View>

      {unlinked ? (
        <>
          {pills}
          <View style={styles.emptyWrap}>
            <EmptyState
              icon="link"
              title="Link your accounts to see your posts"
              body="Connect Instagram and TikTok in Profile. Noni pulls views, likes and follower growth from there."
              actionLabel="Go to Profile"
              onAction={() => router.push('/(creator)/(tabs)/profile' as Href)}
            />
          </View>
        </>
      ) : view === 'calendar' ? (
        <>
          {pills}
          <View style={styles.gridWrap}>
            <MonthGrid
              year={today.getFullYear()}
              month={today.getMonth()}
              postCounts={postCounts}
              selectedDay={selectedDay}
              todayDay={today.getDate()}
              onSelectDay={setSelectedDay}
            />
          </View>
          <View style={styles.dayRow}>
            <Text style={styles.dayLabel}>{dayLabel}</Text>
            {!loading && (
              <Text style={styles.dayCount}>
                {`${dayItems.length} ${dayItems.length === 1 ? 'post' : 'posts'}`}
              </Text>
            )}
          </View>
          <ScrollView
            style={styles.fill}
            contentContainerStyle={styles.listContent}
            refreshControl={refreshControl}
          >
            {loading ? (
              <>
                <SkeletonCard height={88} radius={16} />
                <SkeletonCard height={88} radius={16} />
              </>
            ) : dayItems.length === 0 ? (
              <Text style={styles.dayEmpty}>No posts this day.</Text>
            ) : (
              dayItems.map((item) => renderRow(item, false))
            )}
          </ScrollView>
        </>
      ) : (
        <>
          {pills}
          <View style={styles.sortRow}>
            <Dropdown
              options={SORT_OPTIONS}
              value={sort}
              onChange={setSort}
              labelPrefix="Sort:"
            />
          </View>
          {!loading && items.length === 0 ? (
            <View style={styles.emptyWrap}>
              <EmptyState
                title="Nothing posted yet"
                body="Record your next task on Home. Posts land here once they go live."
                actionLabel="Go to Home"
                onAction={() => router.push('/(creator)/(tabs)' as Href)}
              />
            </View>
          ) : (
            <ScrollView
              style={styles.fill}
              contentContainerStyle={styles.listContent}
              refreshControl={refreshControl}
            >
              {loading ? (
                <>
                  <SkeletonCard height={88} radius={16} />
                  <SkeletonCard height={88} radius={16} />
                  <SkeletonCard height={88} radius={16} />
                </>
              ) : (
                sorted.map((item) => renderRow(item, true))
              )}
            </ScrollView>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: color.white,
  },
  fill: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 30,
    fontWeight: '700',
    letterSpacing: -0.5,
    color: color.ink,
  },
  toggleTrack: {
    flexDirection: 'row',
    gap: 3,
    padding: 3,
    borderRadius: 999,
    backgroundColor: color.fillQuiet,
  },
  toggleItem: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleItemActive: {
    backgroundColor: color.white,
  },
  pillsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 24,
    marginTop: 12,
  },
  pill: {
    flex: 1,
    height: 38,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  pillActive: {
    backgroundColor: color.blue100,
  },
  pillInactive: {
    backgroundColor: color.white,
    borderWidth: 1,
    borderColor: color.line,
  },
  pillText: {
    fontSize: 13,
    fontWeight: '700',
  },
  disabled: {
    opacity: 0.35,
  },
  gridWrap: {
    paddingHorizontal: 24,
    marginTop: 12,
  },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    marginTop: 16,
    marginBottom: 10,
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
  dayEmpty: {
    fontSize: 13,
    fontWeight: '600',
    color: color.slate500,
  },
  sortRow: {
    paddingHorizontal: 24,
    marginTop: 12,
    marginBottom: 10,
    zIndex: 30,
  },
  listContent: {
    paddingHorizontal: 24,
    gap: 8,
    paddingBottom: 96,
  },
  emptyWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingBottom: 96,
  },
});
