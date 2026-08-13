// Briefs — a list of week cards, next week always on top, older weeks
// below. Calendar toggle steps week by week like a calendar app. A week is
// fully planned before it starts, so the list is one Next week card plus
// finished weeks, never a live-incomplete state.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import {
  LaneSummaryCard,
  PostsMadeList,
} from '../../../components/admin/WeekOverview';
import {
  AdminHeader,
  AdminScreen,
  Card,
  SkeletonCard,
  StatPill,
  TypeChip,
} from '../../../components/admin/shared';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Icon, type IconName } from '../../../components/ui/Icon';
import { PressableScale } from '../../../components/ui/PressableScale';
import { formatMetric } from '../../../lib/analytics';
import {
  briefWeekRangeLabel,
  listBriefWeeks,
  listWeekPosts,
  upcomingWeekDropDate,
  type BriefWeekStats,
  type BriefWeekStatus,
  type BriefWeekSummary,
  type WeekPostItem,
} from '../../../lib/briefs-api';
import { color, radiusAdmin, shadow } from '../../../theme/tokens';

type BriefsView = 'list' | 'calendar';

type WeekCardData = {
  key: string;
  /** Null for the synthesized upcoming week with no draft campaign yet. */
  campaignId: string | null;
  label: string;
  range: string;
  status: BriefWeekStatus;
  dayOfWeek: number | null;
  video: { done: number; target: number };
  slideshow: { done: number; target: number };
  stats: BriefWeekStats | null;
};

function chipFor(card: WeekCardData): { tone: 'brand' | 'good' | 'quiet'; label: string } {
  if (card.status === 'next') return { tone: 'brand', label: 'Next week' };
  if (card.status === 'current' && card.dayOfWeek !== null) {
    return { tone: 'good', label: `Day ${card.dayOfWeek} of 7` };
  }
  return { tone: 'quiet', label: 'Done' };
}

function stepperStatus(card: WeekCardData): string {
  if (card.status === 'next') return 'Opens Sunday';
  if (card.status === 'current' && card.dayOfWeek !== null) {
    return `Day ${card.dayOfWeek} of 7`;
  }
  return 'Done';
}

export default function BriefsWeeksScreen() {
  const [weeks, setWeeks] = useState<BriefWeekSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [view, setView] = useState<BriefsView>('list');
  const [wi, setWi] = useState<number | null>(null);
  const [postsCache, setPostsCache] = useState<Record<string, WeekPostItem[]>>({});

  const load = useCallback(async () => {
    try {
      setWeeks(await listBriefWeeks());
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const cards = useMemo<WeekCardData[]>(() => {
    const list: WeekCardData[] = weeks.map((w) => ({
      key: w.campaign.id,
      campaignId: w.campaign.id,
      label: `Week ${w.weekNumber}`,
      range:
        w.campaign.drop_date === null
          ? ''
          : briefWeekRangeLabel(w.campaign.drop_date),
      status: w.status,
      dayOfWeek: w.dayOfWeek,
      video: { done: w.videoDone, target: w.videoTarget },
      slideshow: { done: w.slideshowDone, target: w.slideshowTarget },
      stats: w.stats,
    }));
    if (list.length > 0 && !list.some((c) => c.status === 'next')) {
      list.unshift({
        key: 'upcoming',
        campaignId: null,
        label: `Week ${Math.max(...weeks.map((w) => w.weekNumber)) + 1}`,
        range: briefWeekRangeLabel(upcomingWeekDropDate()),
        status: 'next',
        dayOfWeek: null,
        video: { done: 0, target: 0 },
        slideshow: { done: 0, target: 0 },
        stats: null,
      });
    }
    return list;
  }, [weeks]);

  // Calendar view starts on the live week, not the unplanned next one.
  const defaultWi = Math.max(
    0,
    cards.findIndex((c) => c.status !== 'next'),
  );
  const selIdx = Math.min(wi ?? defaultWi, Math.max(0, cards.length - 1));
  const cw = cards[selIdx];

  useEffect(() => {
    if (view !== 'calendar' || !cw || cw.status === 'next') return;
    const id = cw.campaignId;
    if (id === null || postsCache[id] !== undefined) return;
    let cancelled = false;
    listWeekPosts(id)
      .catch(() => [] as WeekPostItem[])
      .then((posts) => {
        if (!cancelled) setPostsCache((prev) => ({ ...prev, [id]: posts }));
      });
    return () => {
      cancelled = true;
    };
  }, [view, cw, postsCache]);

  function openCard(card: WeekCardData) {
    if (card.campaignId === null) {
      router.push('/(admin)/week-setup');
      return;
    }
    router.push(`/(admin)/week/${card.campaignId}`);
  }

  const cwPosts = cw?.campaignId != null ? postsCache[cw.campaignId] : undefined;

  return (
    <AdminScreen
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            setPostsCache({});
            void load();
          }}
        />
      }
    >
      {!loading && weeks.length === 0 ? (
        <>
          <AdminHeader
            title="Briefs"
            subtitle="A week is one shared pool of posts for the whole roster."
          />
          <EmptyState
            icon="layout-list"
            title="No week yet"
            body="Set the ratio, split the types, and thirty stamped rows appear."
            actionLabel="Start week"
            onAction={() => router.push('/(admin)/week-setup')}
            style={styles.empty}
          />
        </>
      ) : (
        <>
          <View style={styles.headerRow}>
            <Text style={styles.h1}>Briefs</Text>
            <View style={styles.spacer} />
            <View style={styles.toggleTrack}>
              {(
                [
                  { key: 'list', icon: 'layout-list', label: 'List view' },
                  { key: 'calendar', icon: 'calendar-days', label: 'Calendar view' },
                ] as { key: BriefsView; icon: IconName; label: string }[]
              ).map((opt) => {
                const on = view === opt.key;
                return (
                  <PressableScale
                    key={opt.key}
                    accessibilityRole="button"
                    accessibilityLabel={opt.label}
                    accessibilityState={{ selected: on }}
                    hitSlop={6}
                    onPress={() => setView(opt.key)}
                    style={[styles.togglePill, on && [styles.togglePillOn, shadow.shadowCard]]}
                  >
                    <Icon
                      name={opt.icon}
                      size={17}
                      color={on ? color.ink : color.slate400}
                    />
                  </PressableScale>
                );
              })}
            </View>
          </View>

          {loading ? (
            <View style={styles.stack}>
              <SkeletonCard height={78} />
              <SkeletonCard height={72} />
              <SkeletonCard height={72} />
              <SkeletonCard height={72} />
              <SkeletonCard height={72} />
            </View>
          ) : view === 'calendar' && cw ? (
            <View style={styles.calendarStack}>
              <View style={styles.stepper}>
                <PressableScale
                  accessibilityRole="button"
                  accessibilityLabel="Earlier week"
                  disabled={selIdx === cards.length - 1}
                  hitSlop={6}
                  onPress={() => setWi(Math.min(cards.length - 1, selIdx + 1))}
                  style={[
                    styles.stepBtn,
                    shadow.shadowCard,
                    selIdx === cards.length - 1 && styles.stepBtnOff,
                  ]}
                >
                  <Icon name="chevron-left" size={16} color={color.ink} />
                </PressableScale>
                <View style={styles.stepCenter}>
                  <Text style={styles.stepTitle}>{`${cw.label} · ${cw.range}`}</Text>
                  <Text style={styles.stepStatus}>{stepperStatus(cw)}</Text>
                </View>
                <PressableScale
                  accessibilityRole="button"
                  accessibilityLabel="Later week"
                  disabled={selIdx === 0}
                  hitSlop={6}
                  onPress={() => setWi(Math.max(0, selIdx - 1))}
                  style={[styles.stepBtn, shadow.shadowCard, selIdx === 0 && styles.stepBtnOff]}
                >
                  <Icon name="chevron-right" size={16} color={color.ink} />
                </PressableScale>
              </View>

              <View style={styles.lanesRow}>
                <LaneSummaryCard
                  icon="video"
                  label="Videos"
                  done={cw.video.done}
                  target={cw.video.target}
                />
                <LaneSummaryCard
                  icon="images"
                  label="Slideshows"
                  done={cw.slideshow.done}
                  target={cw.slideshow.target}
                />
              </View>

              {cw.status === 'next' ? (
                <Text style={styles.nextNote}>
                  Nothing recorded yet. The brief opens Sunday.
                </Text>
              ) : (
                <PostsMadeList
                  posts={cwPosts ?? []}
                  loading={cwPosts === undefined}
                  formatViews={formatMetric}
                />
              )}
            </View>
          ) : (
            <View style={styles.stack}>
              {cards.map((card) => {
                const chip = chipFor(card);
                return (
                  <Card key={card.key} pad={13} onPress={() => openCard(card)}>
                    <View style={styles.cardHead}>
                      <View style={styles.cardTitleBlock}>
                        <Text numberOfLines={1} style={styles.cardTitle}>
                          {card.label}
                          <Text style={styles.cardRange}>{`  ${card.range}`}</Text>
                        </Text>
                      </View>
                      <TypeChip tone={chip.tone}>{chip.label}</TypeChip>
                      <Icon name="chevron-right" size={16} color={color.slate300} />
                    </View>

                    {card.status === 'next' ? (
                      <Text style={styles.notPlanned}>
                        Not planned yet. Opens Sunday, tap to start it.
                      </Text>
                    ) : (
                      <View style={styles.lanesMini}>
                        {(
                          [
                            { icon: 'video', ...card.video },
                            { icon: 'images', ...card.slideshow },
                          ] as { icon: IconName; done: number; target: number }[]
                        ).map((lane) => (
                          <View key={lane.icon} style={styles.laneMini}>
                            <Icon name={lane.icon} size={13} color={color.slate400} />
                            <View style={styles.laneMiniRail}>
                              <View
                                style={[
                                  styles.laneMiniFill,
                                  {
                                    width: `${
                                      lane.target > 0
                                        ? Math.min(
                                            100,
                                            Math.round((lane.done / lane.target) * 100),
                                          )
                                        : 0
                                    }%`,
                                  },
                                ]}
                              />
                            </View>
                            <Text style={styles.laneMiniCount}>
                              {lane.done}/{lane.target}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}

                    {card.stats !== null ? (
                      <View style={styles.statsRow}>
                        <StatPill
                          value={`$${Math.round(card.stats.earnCentsPerDay / 100)}`}
                          unit="/day avg"
                        />
                        <StatPill
                          value={formatMetric(Math.round(card.stats.viewsPerDay))}
                          unit="views/day"
                        />
                        <StatPill
                          value={card.stats.postsPerCreatorPerDay.toFixed(1)}
                          unit="posts/day"
                        />
                        <View style={styles.spacer} />
                        <Text style={styles.creators}>
                          {card.stats.creators} creators
                        </Text>
                      </View>
                    ) : null}
                  </Card>
                );
              })}
            </View>
          )}
        </>
      )}
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 4,
    marginBottom: 12,
  },
  h1: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.5,
    color: color.ink,
  },
  spacer: {
    flex: 1,
  },
  toggleTrack: {
    flexDirection: 'row',
    gap: 3,
    padding: 3,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.fillQuiet,
  },
  togglePill: {
    width: 36,
    height: 32,
    borderRadius: radiusAdmin.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  togglePillOn: {
    backgroundColor: color.white,
  },
  stack: {
    gap: 10,
  },
  empty: {
    marginTop: 40,
  },
  calendarStack: {
    gap: 12,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  stepBtn: {
    width: 32,
    height: 32,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnOff: {
    opacity: 0.35,
  },
  stepCenter: {
    flex: 1,
    alignItems: 'center',
  },
  stepTitle: {
    fontSize: 14.5,
    fontWeight: '700',
    letterSpacing: -0.2,
    color: color.ink,
  },
  stepStatus: {
    marginTop: 1,
    fontSize: 11.5,
    fontWeight: '600',
    color: color.slate400,
  },
  lanesRow: {
    flexDirection: 'row',
    gap: 10,
  },
  nextNote: {
    marginTop: 4,
    marginHorizontal: 2,
    fontSize: 13,
    fontWeight: '400',
    lineHeight: 13 * 1.45,
    color: color.slate400,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  cardTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.3,
    color: color.ink,
  },
  cardRange: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0,
    color: color.slate400,
  },
  notPlanned: {
    marginTop: 8,
    fontSize: 12.5,
    fontWeight: '400',
    lineHeight: 12.5 * 1.4,
    color: color.slate400,
  },
  lanesMini: {
    marginTop: 10,
    flexDirection: 'row',
    gap: 8,
  },
  laneMini: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  laneMiniRail: {
    flex: 1,
    height: 4,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.fillQuiet,
    overflow: 'hidden',
  },
  laneMiniFill: {
    height: 4,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.blue500,
  },
  laneMiniCount: {
    fontSize: 11.5,
    fontWeight: '700',
    color: color.slate500,
  },
  statsRow: {
    marginTop: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  creators: {
    fontSize: 11,
    fontWeight: '600',
    color: color.slate400,
  },
});
