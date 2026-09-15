import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import { Screen } from '../../../components/layout/Screen';
import { PostCard } from '../../../components/creator/PostCard';
import { PostPager } from '../../../components/creator/PostPager';
import { opensPostDetail } from '../../../components/creator/posts-shared';
import { SwapSheet } from '../../../components/creator/SwapSheet';
import { useCreatorToast } from '../../../components/creator/Toast';
import {
  WeekStrip,
  weekDates,
  weekStartOf,
  type WeekStripDay,
} from '../../../components/creator/WeekStrip';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Icon } from '../../../components/ui/Icon';
import { PressableScale } from '../../../components/ui/PressableScale';
import { SkeletonCard } from '../../../components/ui/Skeleton';
import { CampaignPill, ElsewhereStrip, WAIT_RED } from '../../../components/shared';
import { useAuth } from '../../../lib/auth';
import { useCompany } from '../../../lib/company-context';
import { unreadCreatorInboxCount } from '../../../lib/creator-inbox-api';
import { dayKey, useCreatorQueue, publishTimeLabel } from '../../../lib/creator-queue';
import { isSetupCompleteFlag, useSetupState } from '../../../lib/setup';
import type { TaskStatus } from '../../../lib/tasks';
import {
  listSwapPool,
  swapAssignmentBrief,
  type AssignmentWithBrief,
  type Brief,
} from '../../../lib/tasks-api';
import { color, space, type } from '../../../theme/tokens';
import { CreatorSetupChecklist } from '../setup';

const OPEN = new Set<TaskStatus>(['assigned', 'changes_requested']);
const LOCKED_REASON = 'Finish your missed posts first';

export default function HomeScreen() {
  const { profile } = useAuth();
  const router = useRouter();
  const queue = useCreatorQueue();
  const toast = useCreatorToast();
  const { unreadNotifications, openNotifications } = useCompany();

  const setupFlagged =
    profile !== null && isSetupCompleteFlag(profile.onboarding_answers);
  const setup = useSetupState(!setupFlagged ? profile : null);
  const setupPending =
    !setupFlagged && (setup.state === null || !setup.state.complete);

  const todayKey = dayKey(new Date());
  // Until the creator picks a date, land on the oldest missed post, else today.
  const [pickedDate, setPickedDate] = useState<string | null>(null);
  const [pickedWeek, setPickedWeek] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [unreadAdmin, setUnreadAdmin] = useState(false);

  const hasOverdue = queue.overdue.length > 0;
  const landing = pickedDate === null && hasOverdue ? queue.nextRequired : null;
  const selectedDate = pickedDate ?? landing?.scheduled_date ?? todayKey;
  const weekStart = pickedWeek ?? weekStartOf(selectedDate);

  const setSelectedDate = (date: string) => {
    setPickedDate(date);
    setPickedWeek(weekStartOf(date));
  };

  const jumpTo = (a: AssignmentWithBrief) => {
    setSelectedDate(a.scheduled_date);
    setSelectedId(a.id);
  };

  const [swapFor, setSwapFor] = useState<AssignmentWithBrief | null>(null);
  const [pool, setPool] = useState<Brief[]>([]);
  const [poolLoading, setPoolLoading] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void queue.refetch();
      if (profile?.active_company_id && profile.id) {
        unreadCreatorInboxCount(profile.active_company_id, profile.id).then(
          (count) => setUnreadAdmin(count > 0),
          () => undefined,
        );
      }
      // refetch identity churns with the queue; focus is the real trigger.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [profile?.active_company_id, profile?.id]),
  );

  const daysForWeek = useCallback(
    (start: string): WeekStripDay[] =>
      weekDates(start).map((date) => ({
        date,
        statuses: queue.assignmentsForDate(date).map((a) => ({
          status: a.status,
          overdue: a.scheduled_date < todayKey && OPEN.has(a.status),
        })),
      })),
    [queue, todayKey],
  );

  const dayList = queue.assignmentsForDate(selectedDate);
  const selected = dayList.find((a) => a.id === selectedId) ?? null;

  const locked =
    selected !== null &&
    hasOverdue &&
    OPEN.has(selected.status) &&
    queue.nextRequired !== null &&
    selected.id !== queue.nextRequired.id;

  // Keep a valid selection: default to the first open slot today, first slot
  // on other days.
  useEffect(() => {
    if (dayList.length === 0) {
      if (selectedId !== null) setSelectedId(null);
      return;
    }
    if (dayList.some((a) => a.id === selectedId)) return;
    const required = dayList.find((a) => a.id === queue.nextRequired?.id);
    const firstOpen = dayList.find((a) => OPEN.has(a.status));
    setSelectedId(
      (required ??
        (selectedDate === todayKey && firstOpen ? firstOpen : dayList[0])).id,
    );
  }, [dayList, selectedId, selectedDate, todayKey, queue.nextRequired]);

  // Auto-advance (SCREENS §1.6): when the visible slot flips from open to
  // not-open, jump to the next required slot.
  const statusRef = useRef<Map<string, TaskStatus>>(new Map());
  useEffect(() => {
    const prev = statusRef.current;
    const next = new Map(queue.assignments.map((a) => [a.id, a.status]));
    if (selectedId !== null) {
      const was = prev.get(selectedId);
      const now = next.get(selectedId);
      if (
        was !== undefined &&
        now !== undefined &&
        OPEN.has(was) &&
        !OPEN.has(now)
      ) {
        const target = queue.nextRequired;
        if (target !== null && target.id !== selectedId) {
          setPickedDate(target.scheduled_date);
          setPickedWeek(weekStartOf(target.scheduled_date));
          setSelectedId(target.id);
        }
      }
    }
    statusRef.current = next;
  }, [queue.assignments, queue.nextRequired, selectedId]);

  const loading = queue.loading && queue.assignments.length === 0;
  const firstName = profile?.full_name?.split(' ')[0] ?? 'there';

  const openMessages = () => {
    router.navigate('/(creator)/(tabs)/messages');
  };

  // F5: Fix it goes straight to the normal record/upload flow, the same
  // route Messages and the posts changes detail push for a re-record.
  const recordRoute = (a: AssignmentWithBrief) => {
    if (a.briefs.format === 'photo_carousel' && a.briefs.post_type_id !== null) {
      router.push(`/(creator)/upload/${a.id}`);
      return;
    }
    router.push(`/(creator)/record/${a.id}?assignment=1`);
  };

  const recordOrCatchUp = (a: AssignmentWithBrief) => {
    if (locked && queue.nextRequired !== null) {
      jumpTo(queue.nextRequired);
      toast.show('Catch up on your missed posts first.');
      return;
    }
    recordRoute(a);
  };

  const openSwap = (a: AssignmentWithBrief) => {
    setSwapFor(a);
    setPool([]);
    setPoolLoading(true);
    listSwapPool(a)
      .then(setPool, () => setPool([]))
      .finally(() => setPoolLoading(false));
  };

  const swapInFlight = useRef(false);
  const pickSwap = async (brief: Brief) => {
    if (swapFor === null || swapInFlight.current) return;
    swapInFlight.current = true;
    try {
      const updated = await swapAssignmentBrief(swapFor.id, brief.id);
      queue.applyLocal(updated);
      setSwapFor(null);
      toast.show(`Swapped in "${brief.title}".`);
    } catch {
      setSwapFor(null);
      toast.show('Could not swap that post. Try again.');
    } finally {
      swapInFlight.current = false;
    }
  };

  if (setupPending) {
    return <CreatorSetupChecklist />;
  }

  return (
    <Screen bg={color.white} contentStyle={styles.body}>
      <View style={styles.headerRow}>
        <CampaignPill />
        <View style={styles.headerActions}>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={
              unreadAdmin ? 'Open messages, unread' : 'Open messages'
            }
            onPress={openMessages}
            hitSlop={10}
            style={styles.iconBtn}
          >
            <Icon name="message-circle" size={23} color={color.ink} />
            {unreadAdmin ? <View style={styles.unreadDot} /> : null}
          </PressableScale>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={
              unreadNotifications > 0
                ? `Notifications, ${unreadNotifications} unread`
                : 'Notifications'
            }
            onPress={openNotifications}
            hitSlop={10}
            style={styles.iconBtn}
          >
            <Icon name="bell" size={23} color={color.ink} />
            {unreadNotifications > 0 ? (
              <View style={styles.bellBadge}>
                <Text style={styles.bellBadgeText}>
                  {unreadNotifications > 99 ? '99+' : unreadNotifications}
                </Text>
              </View>
            ) : null}
          </PressableScale>
        </View>
      </View>

      <Text style={styles.greeting}>Welcome back, {firstName}.</Text>

      <ElsewhereStrip />

      <WeekStrip
        weekStart={weekStart}
        daysForWeek={daysForWeek}
        selectedDate={selectedDate}
        onSelectDate={(date) => {
          setSelectedDate(date);
          setSelectedId(null);
        }}
        onWeekChange={setPickedWeek}
      />

      {dayList.length > 0 ? (
        <PostPager
          items={dayList.map((a) => ({
            key: a.id,
            label: publishTimeLabel(a, dayList.length),
            status: a.status,
          }))}
          selectedKey={selected?.id ?? dayList[0].id}
          onSelect={setSelectedId}
        />
      ) : null}

      <View style={styles.hero}>
        {selected !== null ? (
          <PostCard
            assignment={selected}
            mediaPath={queue.mediaPaths.get(selected.id) ?? null}
            publishTime={publishTimeLabel(selected, dayList.length)}
            showSwap={selected.status === 'assigned' && selectedDate === todayKey}
            onOpen={() =>
              router.push({
                pathname: '/(creator)/assignment/[id]',
                params: { id: selected.id },
              })
            }
            lockedReason={locked ? LOCKED_REASON : null}
            onRecord={() => recordOrCatchUp(selected)}
            onSwap={() => openSwap(selected)}
            onSee={() =>
              router.push({
                // F7: posted work opens the post detail; in-review work keeps
                // the brief detail with its "In review" state.
                pathname: opensPostDetail(selected.status)
                  ? '/(creator)/posts/[id]'
                  : '/(creator)/post/[id]',
                params: { id: selected.id },
              })
            }
            onFix={() => recordOrCatchUp(selected)}
            onFeedback={openMessages}
          />
        ) : loading ? (
          <SkeletonCard radius={24} style={styles.skeleton} />
        ) : (
          <View style={styles.emptyWrap}>
            <EmptyState
              compact
              icon="sparkles"
              title="Nothing planned"
              body="Your queue fills automatically. Check back soon."
            />
          </View>
        )}
      </View>

      <SwapSheet
        visible={swapFor !== null}
        format={swapFor?.briefs.format ?? 'video'}
        briefs={pool}
        loading={poolLoading}
        onPick={(brief) => void pickSwap(brief)}
        onClose={() => setSwapFor(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    paddingHorizontal: space.gutter,
    paddingTop: 6,
    paddingBottom: 108,
    gap: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  iconBtn: {
    position: 'relative',
  },
  unreadDot: {
    position: 'absolute',
    top: -1,
    right: -2,
    width: 9,
    height: 9,
    borderRadius: 999,
    backgroundColor: color.accent,
    borderWidth: 2,
    borderColor: color.white,
  },
  bellBadge: {
    position: 'absolute',
    top: -6,
    right: -8,
    minWidth: 17,
    height: 17,
    paddingHorizontal: 4,
    borderRadius: 999,
    backgroundColor: WAIT_RED,
    borderWidth: 2,
    borderColor: color.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellBadgeText: {
    color: color.white,
    fontSize: 10.5,
    fontWeight: '800',
  },
  greeting: {
    fontSize: 28,
    lineHeight: 28 * type.leading.title,
    fontWeight: type.weight.bold,
    letterSpacing: type.tracking.title,
    color: color.ink,
  },
  hero: {
    flex: 1,
    minHeight: 0,
  },
  skeleton: {
    flex: 1,
  },
  emptyWrap: {
    flex: 1,
    justifyContent: 'center',
  },
});
