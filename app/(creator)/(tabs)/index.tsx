import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useRouter } from 'expo-router';

import { Screen } from '../../../components/layout/Screen';
import { PostCard } from '../../../components/creator/PostCard';
import { PostPager } from '../../../components/creator/PostPager';
import { isPostedStatus } from '../../../components/creator/posts-shared';
import { SwapSheet } from '../../../components/creator/SwapSheet';
import { useCreatorToast } from '../../../components/creator/Toast';
import { WeekStrip } from '../../../components/creator/WeekStrip';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Icon } from '../../../components/ui/Icon';
import { PressableScale } from '../../../components/ui/PressableScale';
import { SkeletonCard } from '../../../components/ui/Skeleton';
import { Wordmark } from '../../../components/ui/Wordmark';
import { useAuth } from '../../../lib/auth';
import { dayKey, useCreatorQueue, slotTimeLabel } from '../../../lib/creator-queue';
import { isSetupCompleteFlag, useSetupState } from '../../../lib/setup';
import { supabase } from '../../../lib/supabase';
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

function chatSeenKey(creatorId: string): string {
  return `noni.chat.seenAt.${creatorId}`;
}

async function hasUnreadAdminMessage(
  companyId: string,
  creatorId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('messages')
    .select('created_at')
    .eq('company_id', companyId)
    .eq('creator_id', creatorId)
    .neq('author_id', creatorId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return false;
  const seenAt = await AsyncStorage.getItem(chatSeenKey(creatorId));
  if (seenAt === null) return true;
  return new Date(data.created_at).getTime() > new Date(seenAt).getTime();
}

/** Monday-first week around today, as YYYY-MM-DD keys. */
function weekDates(todayKey: string): string[] {
  const today = new Date(`${todayKey}T12:00:00`);
  const start = new Date(today);
  start.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return dayKey(d);
  });
}

export default function HomeScreen() {
  const { profile } = useAuth();
  const router = useRouter();
  const queue = useCreatorQueue();
  const toast = useCreatorToast();

  const setupFlagged =
    profile !== null && isSetupCompleteFlag(profile.onboarding_answers);
  const setup = useSetupState(!setupFlagged ? profile : null);
  const setupPending =
    !setupFlagged && (setup.state === null || !setup.state.complete);

  const todayKey = dayKey(new Date());
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [unreadAdmin, setUnreadAdmin] = useState(false);

  const [swapFor, setSwapFor] = useState<AssignmentWithBrief | null>(null);
  const [pool, setPool] = useState<Brief[]>([]);
  const [poolLoading, setPoolLoading] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void queue.refetch();
      if (profile?.company_id && profile.id) {
        hasUnreadAdminMessage(profile.company_id, profile.id).then(
          setUnreadAdmin,
          () => undefined,
        );
      }
      // refetch identity churns with the queue; focus is the real trigger.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [profile?.company_id, profile?.id]),
  );

  const days = useMemo(
    () =>
      weekDates(todayKey).map((date) => ({
        date,
        statuses: queue.assignmentsForDate(date).map((a) => a.status),
      })),
    [todayKey, queue],
  );

  const dayList = queue.assignmentsForDate(selectedDate);
  const selected = dayList.find((a) => a.id === selectedId) ?? null;

  // Keep a valid selection: default to the first open slot today, first slot
  // on other days.
  useEffect(() => {
    if (dayList.length === 0) {
      if (selectedId !== null) setSelectedId(null);
      return;
    }
    if (dayList.some((a) => a.id === selectedId)) return;
    const firstOpen = dayList.find((a) => OPEN.has(a.status));
    setSelectedId(
      (selectedDate === todayKey && firstOpen ? firstOpen : dayList[0]).id,
    );
  }, [dayList, selectedId, selectedDate, todayKey]);

  // Auto-advance (SCREENS §1.6): when the visible slot flips from open to
  // not-open, jump to the first open slot.
  const statusRef = useRef<Map<string, TaskStatus>>(new Map());
  useEffect(() => {
    const prev = statusRef.current;
    const next = new Map(queue.assignments.map((a) => [a.id, a.status]));
    if (selectedId !== null && selectedDate === todayKey) {
      const was = prev.get(selectedId);
      const now = next.get(selectedId);
      if (
        was !== undefined &&
        now !== undefined &&
        OPEN.has(was) &&
        !OPEN.has(now)
      ) {
        const firstOpen = queue.openToday.find((a) => a.id !== selectedId);
        if (firstOpen !== undefined) setSelectedId(firstOpen.id);
      }
    }
    statusRef.current = next;
  }, [queue.assignments, queue.openToday, selectedId, selectedDate, todayKey]);

  const loading = queue.loading && queue.assignments.length === 0;
  const firstName = profile?.full_name?.split(' ')[0] ?? 'there';

  const subCopy = (() => {
    if (loading) return 'Building your day…';
    if (selectedDate !== todayKey) return `${dayList.length} planned.`;
    const { toFix, toShoot, totalToday } = queue.counts;
    if (toFix > 0) return `${toFix} to fix, ${toShoot} left to shoot.`;
    if (toShoot > 0) return `${toShoot} left to shoot today.`;
    if (totalToday > 0) return 'All shot for today.';
    return 'Nothing planned today.';
  })();

  const openMessages = () => {
    if (profile?.id) {
      void AsyncStorage.setItem(
        chatSeenKey(profile.id),
        new Date().toISOString(),
      ).catch(() => undefined);
    }
    setUnreadAdmin(false);
    router.push('/(creator)/messages');
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

  const openSwap = (a: AssignmentWithBrief) => {
    setSwapFor(a);
    setPool([]);
    setPoolLoading(true);
    listSwapPool(a)
      .then(setPool, () => setPool([]))
      .finally(() => setPoolLoading(false));
  };

  const pickSwap = async (brief: Brief) => {
    if (swapFor === null) return;
    try {
      const updated = await swapAssignmentBrief(swapFor.id, brief.id);
      queue.applyLocal(updated);
      setSwapFor(null);
      toast.show(`Swapped in "${brief.title}".`);
    } catch {
      setSwapFor(null);
      toast.show('Could not swap that post. Try again.');
    }
  };

  if (setupPending) {
    return <CreatorSetupChecklist />;
  }

  return (
    <Screen bg={color.white} contentStyle={styles.body}>
      <View style={styles.headerRow}>
        <Wordmark size={19} />
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
          <View style={styles.iconBtn}>
            <Icon name="bell" size={23} color={color.ink} />
          </View>
        </View>
      </View>

      <View style={styles.welcome}>
        <Text style={styles.greeting}>Welcome back, {firstName}.</Text>
        <Text style={styles.sub}>{subCopy}</Text>
      </View>

      <WeekStrip
        days={days}
        selectedDate={selectedDate}
        onSelectDate={(date) => {
          setSelectedDate(date);
          setSelectedId(null);
        }}
      />

      {dayList.length > 0 ? (
        <PostPager
          items={dayList.map((a) => ({
            key: a.id,
            label: slotTimeLabel(a.slot_index),
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
            showSwap={selected.status === 'assigned' && selectedDate === todayKey}
            onOpen={() =>
              router.push({
                pathname: '/(creator)/assignment/[id]',
                params: { id: selected.id },
              })
            }
            onRecord={() => recordRoute(selected)}
            onSwap={() => openSwap(selected)}
            onSee={() =>
              router.push({
                // F7: posted work opens the post detail; in-review work keeps
                // the brief detail with its "In review" state.
                pathname: isPostedStatus(selected.status)
                  ? '/(creator)/posts/[id]'
                  : '/(creator)/post/[id]',
                params: { id: selected.id },
              })
            }
            onFix={() => recordRoute(selected)}
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
    paddingTop: 14,
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
  welcome: {
    gap: 4,
  },
  greeting: {
    fontSize: 28,
    lineHeight: 28 * type.leading.title,
    fontWeight: type.weight.bold,
    letterSpacing: type.tracking.title,
    color: color.ink,
  },
  sub: {
    fontSize: type.size.bodySm,
    fontWeight: type.weight.regular,
    color: color.slate500,
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
