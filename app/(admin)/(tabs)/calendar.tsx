import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect, type Href } from 'expo-router';

import {
  LaneSummaryCard,
  PostsMadeList,
} from '../../../components/admin/WeekOverview';
import {
  AdminScreen,
  Card,
  MsgButton,
  SkeletonCard,
  TypeChip,
} from '../../../components/admin/shared';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Icon, type IconName } from '../../../components/ui/Icon';
import { PressableScale } from '../../../components/ui/PressableScale';
import { formatMetric } from '../../../lib/analytics';
import { useAuth } from '../../../lib/auth';
import {
  briefWeekOpensLabel,
  briefWeekRangeLabel,
  listBriefWeeks,
  listWeekPosts,
  type BriefWeekStatus,
  type BriefWeekSummary,
  type WeekPostItem,
} from '../../../lib/briefs-api';
import { unreadManagerMessageCount } from '../../../lib/manager-messages-api';
import { color, radiusAdmin, shadow } from '../../../theme/tokens';

type BriefsView = 'list' | 'calendar';

type LaneProgress = { done: number; target: number };

type WeekCardData = {
  key: string;
  /** Null for the synthesized upcoming week with no draft campaign yet. */
  campaignId: string | null;
  label: string;
  /** Null until a start day has been chosen in week setup. */
  startDay: string | null;
  status: BriefWeekStatus;
  dayOfWeek: number | null;
  video: LaneProgress;
  slideshow: LaneProgress;
  /** False until week setup has stamped rows. */
  planned: boolean;
};

function opensSentence(startDay: string): string {
  const opens = briefWeekOpensLabel(startDay);
  return opens.charAt(0).toUpperCase() + opens.slice(1);
}

function stepperStatus(card: WeekCardData): string {
  if (card.status === 'next') {
    return card.startDay === null ? 'Not planned' : opensSentence(card.startDay);
  }
  if (card.status === 'current' && card.dayOfWeek !== null) {
    return `Day ${card.dayOfWeek} of 7`;
  }
  return 'Done';
}

function notPlannedLine(startDay: string | null): string {
  if (startDay === null) return 'Not planned yet. Tap to start it.';
  return `Not planned yet. ${opensSentence(startDay)}. Tap to start it.`;
}

function statusChip(card: WeekCardData) {
  if (card.status === 'next') return <TypeChip tone="brand">Next week</TypeChip>;
  if (card.status === 'current') {
    return <TypeChip tone="good">{`Day ${card.dayOfWeek ?? 1} of 7`}</TypeChip>;
  }
  return <TypeChip tone="quiet">Done</TypeChip>;
}

function ProgressRail({ icon, lane }: { icon: IconName; lane: LaneProgress }) {
  const ratio = lane.target > 0 ? Math.min(1, Math.max(0, lane.done / lane.target)) : 0;
  return (
    <View style={styles.rail}>
      <Icon name={icon} size={13} color={color.slate400} />
      <View style={styles.railTrack}>
        <View style={[styles.railFill, { width: `${ratio * 100}%` }]} />
      </View>
      <Text style={styles.railText}>{`${lane.done}/${lane.target}`}</Text>
    </View>
  );
}

export default function BriefsWeeksScreen() {
  const { refreshManagerAccess } = useAuth();
  const [weeks, setWeeks] = useState<BriefWeekSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [view, setView] = useState<BriefsView>('list');
  const [wi, setWi] = useState<number | null>(null);
  const [postsCache, setPostsCache] = useState<Record<string, WeekPostItem[]>>({});
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    try {
      const [next, nextUnread] = await Promise.all([
        listBriefWeeks(),
        unreadManagerMessageCount().catch(() => 0),
        refreshManagerAccess(),
      ]);
      setWeeks(next);
      setUnread(nextUnread);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [refreshManagerAccess]);

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
      startDay: w.campaign.drop_date,
      status: w.status,
      dayOfWeek: w.dayOfWeek,
      video: { done: w.videoDone, target: w.videoTarget },
      slideshow: { done: w.slideshowDone, target: w.slideshowTarget },
      planned: w.rowCount > 0,
    }));
    if (list.length > 0 && !list.some((c) => c.status === 'next')) {
      list.unshift({
        key: 'upcoming',
        campaignId: null,
        label: `Week ${Math.max(...weeks.map((w) => w.weekNumber)) + 1}`,
        startDay: null,
        status: 'next',
        dayOfWeek: null,
        video: { done: 0, target: 0 },
        slideshow: { done: 0, target: 0 },
        planned: false,
      });
    }
    return list;
  }, [weeks]);

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

  function openMessages() {
    router.push('/(admin)/messages' as Href);
  }

  function openCard(card: WeekCardData) {
    if (card.campaignId === null) {
      router.push('/(admin)/week-setup');
      return;
    }
    router.push(`/(admin)/week/${card.campaignId}`);
  }

  const cwPosts = cw?.campaignId != null ? postsCache[cw.campaignId] : undefined;
  const empty = !loading && weeks.length === 0;

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
      <View style={styles.headerRow}>
        <Text style={styles.h1}>Briefs</Text>
        <View style={styles.spacer} />
        <MsgButton count={unread} onPress={openMessages} />
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

      {empty ? (
        <EmptyState
          icon="layout-list"
          title="No week yet"
          body="Pick videos and slideshows a day and the rows appear."
          actionLabel="Start week"
          onAction={() => router.push('/(admin)/week-setup')}
        />
      ) : loading ? (
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
              <Text style={styles.stepTitle}>{cw.startDay === null
                ? cw.label
                : `${cw.label} · ${briefWeekRangeLabel(cw.startDay)}`}</Text>
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
              {cw.startDay === null
                ? 'Nothing recorded yet. Start the week to plan it.'
                : `Nothing recorded yet. The brief ${briefWeekOpensLabel(cw.startDay)}.`}
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
          {cards.map((card) => (
            <Card
              key={card.key}
              pad={13}
              onPress={() => openCard(card)}
              style={styles.weekCard}
            >
              <View style={styles.cardHead}>
                <View style={styles.cardTitleRow}>
                  <Text numberOfLines={1} style={styles.cardTitle}>
                    {card.label}
                  </Text>
                  {card.startDay !== null ? (
                    <Text numberOfLines={1} style={styles.cardRange}>
                      {briefWeekRangeLabel(card.startDay)}
                    </Text>
                  ) : null}
                </View>
                {statusChip(card)}
                <Icon name="chevron-right" size={16} color={color.slate300} />
              </View>

              {!card.planned ? (
                <Text style={styles.notPlanned}>{notPlannedLine(card.startDay)}</Text>
              ) : (
                <View style={styles.railsRow}>
                  <ProgressRail icon="video" lane={card.video} />
                  <ProgressRail icon="images" lane={card.slideshow} />
                </View>
              )}
            </Card>
          ))}
        </View>
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
  weekCard: {
    gap: 10,
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
    gap: 8,
  },
  cardTitleRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
    color: color.ink,
  },
  cardRange: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '600',
    color: color.slate400,
  },
  notPlanned: {
    fontSize: 12.5,
    fontWeight: '400',
    lineHeight: 12.5 * 1.4,
    color: color.slate400,
  },
  railsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  rail: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  railTrack: {
    flex: 1,
    height: 4,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.fillQuiet,
    overflow: 'hidden',
  },
  railFill: {
    height: '100%',
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.blue500,
  },
  railText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: color.ink,
  },
});
