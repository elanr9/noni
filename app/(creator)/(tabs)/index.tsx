// Creator home (briefs redesign): company pill, welcome line, day strip,
// today's main card and the Also today list. Today's briefs come from
// listCreatorBriefsForDay (post type join) and refresh whenever the queue
// provider's realtime list for today changes.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import { Screen } from '../../../components/layout/Screen';
import { AllDoneBanner } from '../../../components/creator/briefs/home/AllDoneBanner';
import { AlsoTodayRow } from '../../../components/creator/briefs/home/AlsoTodayRow';
import { DayStrip } from '../../../components/creator/briefs/home/DayStrip';
import { TodayCard } from '../../../components/creator/briefs/home/TodayCard';
import { creatorStatus } from '../../../components/creator/briefs/model';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Icon } from '../../../components/ui/Icon';
import { PressableScale } from '../../../components/ui/PressableScale';
import { SkeletonCard } from '../../../components/ui/Skeleton';
import { CampaignPill, WAIT_RED } from '../../../components/shared';
import { useAuth } from '../../../lib/auth';
import { listCreatorBriefsForDay, type CreatorBriefItem } from '../../../lib/briefs-api';
import { useCompany } from '../../../lib/company-context';
import { unreadCreatorInboxCount } from '../../../lib/creator-inbox-api';
import { dayKey, useCreatorQueue } from '../../../lib/creator-queue';
import { isSetupCompleteFlag, useSetupState } from '../../../lib/setup';
import { color, space, type } from '../../../theme/tokens';
import { CreatorSetupChecklist } from '../setup';

const WEEKDAY = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'long' });

function weekdayOf(dateKey: string): string {
  return WEEKDAY.format(new Date(`${dateKey}T00:00:00Z`));
}

export default function HomeScreen() {
  const { profile } = useAuth();
  const router = useRouter();
  const queue = useCreatorQueue();
  const { active, unreadNotifications, openNotifications } = useCompany();

  const setupFlagged = profile !== null && isSetupCompleteFlag(profile.onboarding_answers);
  const setup = useSetupState(!setupFlagged ? profile : null);
  const setupPending = !setupFlagged && (setup.state === null || !setup.state.complete);

  const companyId = profile?.active_company_id ?? null;
  const creatorId = profile?.id ?? null;
  const todayKey = dayKey(new Date());

  const [fetched, setFetched] = useState<CreatorBriefItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadSeq, setReloadSeq] = useState(0);
  const [slot, setSlot] = useState<string | null>(null);
  const [unreadAdmin, setUnreadAdmin] = useState(false);

  // Realtime: the provider refetches on every assignments change; a change in
  // today's ids or statuses reloads the joined briefs.
  const todaySig = queue.todayAssignments.map((a) => `${a.id}:${a.status}`).join(',');

  useEffect(() => {
    if (companyId === null || creatorId === null) return;
    let cancelled = false;
    listCreatorBriefsForDay({ companyId, creatorId, day: todayKey }).then(
      (items) => {
        if (cancelled) return;
        setFetched(items);
        setError(null);
      },
      (e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Could not load today.');
      },
    );
    return () => {
      cancelled = true;
    };
  }, [companyId, creatorId, todayKey, todaySig, reloadSeq]);

  useFocusEffect(
    useCallback(() => {
      void queue.refetch();
      if (companyId && creatorId) {
        unreadCreatorInboxCount(companyId, creatorId).then(
          (count) => setUnreadAdmin(count > 0),
          () => undefined,
        );
      }
      // refetch identity churns with the queue; focus is the real trigger.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [companyId, creatorId]),
  );

  const statusById = useMemo(
    () => new Map(queue.todayAssignments.map((a) => [a.id, a.status] as const)),
    [queue.todayAssignments],
  );

  const items = useMemo<CreatorBriefItem[]>(
    () => (fetched ?? []).map((it) => ({ ...it, status: statusById.get(it.assignmentId) ?? it.status })),
    [fetched, statusById],
  );

  const left = items.filter((it) => creatorStatus(it.status) === 'assigned').length;
  const posted = items.filter((it) => creatorStatus(it.status) === 'posted').length;
  const inReview = items.filter((it) => creatorStatus(it.status) === 'review').length;

  const current =
    items.find((it) => it.assignmentId === slot) ??
    items.find((it) => creatorStatus(it.status) === 'assigned') ??
    items[0] ??
    null;

  const nextDay = useMemo(() => {
    const future = queue.assignments
      .map((a) => a.scheduled_date)
      .filter((d) => d > todayKey)
      .sort();
    return future[0] ? weekdayOf(future[0]) : null;
  }, [queue.assignments, todayKey]);

  const loading = fetched === null && error === null;
  const firstName = profile?.full_name?.split(' ')[0] ?? 'there';
  const companyName = active?.name ?? 'Your team';

  const openMessages = () => router.navigate('/(creator)/(tabs)/messages');
  const openMake = (item: CreatorBriefItem) =>
    router.push({ pathname: '/(creator)/make/[id]', params: { id: item.assignmentId } });

  if (setupPending) return <CreatorSetupChecklist />;

  const alsoLabel =
    left === 0 ? 'Also today' : left === 1 ? 'Also today \u00b7 1 left to make' : `Also today \u00b7 ${left} left to make`;

  return (
    <Screen bg={color.offWhite} scroll contentStyle={styles.body}>
      <View style={styles.headerRow}>
        <CampaignPill />
        <View style={styles.headerActions}>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={unreadAdmin ? 'Open messages, unread' : 'Open messages'}
            onPress={openMessages}
            hitSlop={10}
            style={styles.iconBtn}
          >
            <Icon name="message-circle" size={23} color={color.ink} />
            {unreadAdmin ? <View style={styles.unreadDot} /> : null}
          </PressableScale>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={unreadNotifications > 0 ? `Notifications, ${unreadNotifications} unread` : 'Notifications'}
            onPress={openNotifications}
            hitSlop={10}
            style={styles.iconBtn}
          >
            <Icon name="bell" size={23} color={color.ink} />
            {unreadNotifications > 0 ? (
              <View style={styles.bellBadge}>
                <Text style={styles.bellBadgeText}>{unreadNotifications > 99 ? '99+' : unreadNotifications}</Text>
              </View>
            ) : null}
          </PressableScale>
        </View>
      </View>

      <Text style={styles.greeting}>Welcome back, {firstName}.</Text>

      <DayStrip todayKey={todayKey} todayCount={items.length} />

      {!loading && items.length > 0 && left === 0 ? (
        <AllDoneBanner posted={posted} inReview={inReview} nextDay={nextDay} />
      ) : null}

      {current ? (
        <TodayCard key={current.assignmentId} item={current} companyName={companyName} onCreate={() => openMake(current)} />
      ) : loading ? (
        <SkeletonCard radius={24} style={styles.skeleton} />
      ) : error ? (
        <View style={styles.errorWrap}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable accessibilityRole="button" onPress={() => setReloadSeq((n) => n + 1)} style={styles.retry}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.emptyWrap}>
          <EmptyState compact icon="sparkles" title="Nothing planned" body="Your queue fills automatically. Check back soon." />
        </View>
      )}

      {items.length > 1 && current ? (
        <View style={styles.also}>
          <Text style={styles.alsoLabel}>{alsoLabel}</Text>
          {items
            .filter((it) => it.assignmentId !== current.assignmentId)
            .map((it) => (
              <AlsoTodayRow key={it.assignmentId} item={it} onPress={() => setSlot(it.assignmentId)} />
            ))}
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: space.gutter,
    paddingTop: 4,
    paddingBottom: 104,
    gap: 12,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  iconBtn: { position: 'relative' },
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
  bellBadgeText: { color: color.white, fontSize: 10.5, fontWeight: '800' },
  greeting: {
    fontFamily: type.font.display,
    fontSize: 26,
    lineHeight: 29,
    fontWeight: type.weight.bold,
    letterSpacing: type.tracking.title,
    color: color.ink,
  },
  skeleton: { height: 196 },
  errorWrap: { alignItems: 'center', gap: 10, paddingVertical: 24 },
  errorText: { fontSize: type.size.meta, color: color.slate500, textAlign: 'center' },
  retry: { height: 44, paddingHorizontal: 18, borderRadius: 999, backgroundColor: color.white, borderWidth: 1, borderColor: color.border, justifyContent: 'center' },
  retryText: { fontSize: type.size.meta, fontWeight: '700', color: color.ink },
  emptyWrap: { paddingVertical: 24 },
  also: { gap: 6 },
  alsoLabel: {
    fontFamily: type.font.ui,
    fontSize: 11.5,
    fontWeight: '700',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    color: color.slate400,
    paddingTop: 2,
    paddingHorizontal: 2,
  },
});
