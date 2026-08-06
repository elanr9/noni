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
import { SwapSheet } from '../../../components/creator/SwapSheet';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Icon } from '../../../components/ui/Icon';
import { PressableScale } from '../../../components/ui/PressableScale';
import { SkeletonCard } from '../../../components/ui/Skeleton';
import { StatusChip } from '../../../components/StatusChip';
import { Wordmark } from '../../../components/ui/Wordmark';
import { useAuth } from '../../../lib/auth';
import {
  getCreatorAccount,
  type CreatorAccountStatus,
} from '../../../lib/creator-accounts-api';
import { getCompany } from '../../../lib/onboarding';
import {
  DEFAULT_STREAK_MILESTONES,
  fetchMyStreak,
  parseStreakMilestones,
  streakBonusText,
  type StreakMilestone,
} from '../../../lib/streaks';
import {
  listMyAssignments,
  listSwapPool,
  parseAssignmentMetrics,
  swapAssignmentBrief,
  type AssignmentWithBrief,
  type Brief,
} from '../../../lib/tasks-api';
import { color, motion, shadow } from '../../../theme/tokens';

const CLEARED = new Set(['approved', 'posted']);

function dayKey(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const dd = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${dd}`;
}

export default function HomeScreen() {
  const { profile } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [assignments, setAssignments] = useState<AssignmentWithBrief[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [swapOpen, setSwapOpen] = useState(false);
  const [swapPool, setSwapPool] = useState<Brief[]>([]);
  const [swapLoading, setSwapLoading] = useState(false);
  const [streak, setStreak] = useState(0);
  const [milestones, setMilestones] = useState<StreakMilestone[]>(
    DEFAULT_STREAK_MILESTONES,
  );
  const [accountStatus, setAccountStatus] = useState<
    CreatorAccountStatus | 'none' | null
  >(null);

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
      const [next, streakRow, company, account] = await Promise.all([
        listMyAssignments(profile.id),
        profile.company_id
          ? fetchMyStreak(profile.company_id, profile.id).catch(() => null)
          : Promise.resolve(null),
        profile.company_id
          ? getCompany(profile.company_id).catch(() => null)
          : Promise.resolve(null),
        profile.company_id
          ? getCreatorAccount(profile.company_id, profile.id).catch(() => null)
          : Promise.resolve(null),
      ]);
      setAssignments(next);
      setStreak(streakRow?.current_streak ?? 0);
      if (company) setMilestones(parseStreakMilestones(company.settings));
      setAccountStatus((account?.status as CreatorAccountStatus | undefined) ?? 'none');
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

  const todayKey = dayKey(new Date());
  const tomorrowKey = useMemo(() => {
    const t = new Date();
    t.setDate(t.getDate() + 1);
    return dayKey(t);
  }, []);

  const today = useMemo(
    () => assignments.filter((a) => a.scheduled_date === todayKey),
    [assignments, todayKey],
  );
  const tomorrowFirst = useMemo(
    () => assignments.find((a) => a.scheduled_date === tomorrowKey),
    [assignments, tomorrowKey],
  );

  // The hero never leaves Home until it clears (approved or posted).
  const hero = today.find((a) => !CLEARED.has(a.status));
  const rest = today.filter((a) => a !== hero && !CLEARED.has(a.status));
  const allClear = today.length > 0 && hero === undefined;

  const firstName = profile?.full_name?.split(' ')[0] ?? 'creator';

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

  const openSwap = async (a: AssignmentWithBrief) => {
    setSwapOpen(true);
    setSwapLoading(true);
    try {
      setSwapPool(await listSwapPool(a));
    } catch {
      setSwapPool([]);
    } finally {
      setSwapLoading(false);
    }
  };

  const pickSwap = async (brief: Brief) => {
    if (hero === undefined) return;
    setSwapOpen(false);
    try {
      const updated = await swapAssignmentBrief(hero.id, brief.id);
      setAssignments((prev) =>
        prev.map((a) => (a.id === updated.id ? updated : a)),
      );
      showToast(`Swapped in "${updated.briefs.title}".`);
    } catch {
      showToast('Could not swap that in. Try again.');
    }
  };

  const heroViews = useMemo(() => {
    if (hero === undefined) return undefined;
    const views = parseAssignmentMetrics(hero.metrics).views;
    return views !== undefined ? `${formatViews(views)} views` : undefined;
  }, [hero]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.headerRow}>
        <Wordmark size={19} />
        <View>
          <Icon name="bell" size={23} color={color.ink} />
          <View style={styles.bellDot} />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.column}
        alwaysBounceVertical
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
        <View style={styles.greetingRow}>
          <View style={styles.greeting}>
            <Text style={styles.greetingTitle}>Welcome back, {firstName}.</Text>
            <Text style={styles.greetingSub}>
              {today.length === 0
                ? 'Nothing queued today.'
                : allClear
                  ? 'All done for today.'
                  : `${today.length - today.filter((a) => CLEARED.has(a.status)).length} to clear today.`}
            </Text>
          </View>
          <PressableScale
            style={styles.streakPill}
            onPress={() => showToast(streakBonusText(streak, milestones))}
          >
            <Icon name="flame" size={16} color={color.amber} />
            <Text style={styles.streakCount}>{streak}</Text>
          </PressableScale>
        </View>

        {accountStatus !== null && accountStatus !== 'approved' && (
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="Open account setup"
            onPress={() => router.push('/(creator)/account-setup')}
            style={[styles.accountBanner, shadow.shadowCard]}
          >
            <Icon
              name={accountStatus === 'pending' ? 'clock' : 'circle-alert'}
              size={19}
              color={accountStatus === 'pending' ? color.blue700 : color.amber}
            />
            <View style={styles.accountBannerText}>
              <Text style={styles.accountBannerTitle}>
                {accountStatus === 'none'
                  ? 'Set up your accounts'
                  : accountStatus === 'pending'
                    ? 'Accounts in review'
                    : 'Changes needed on your accounts'}
              </Text>
              <Text style={styles.accountBannerSub}>
                {accountStatus === 'pending'
                  ? 'You will hear back soon.'
                  : 'Approval unlocks your first posts.'}
              </Text>
            </View>
            <Icon name="chevron-right" size={17} color={color.slate400} />
          </PressableScale>
        )}

        {loading ? (
          <SkeletonCard height={420} radius={24} />
        ) : today.length === 0 ? (
          <View style={styles.emptyWrap}>
            <EmptyState
              icon="sparkles"
              title="Nothing queued today"
              body="Your next week of posts lands when the campaign drops."
            />
          </View>
        ) : hero !== undefined ? (
          <>
            <View style={styles.heroFrame}>
              <PostCard
                assignment={hero}
                viewsLabel={heroViews}
                showSwap={hero.status === 'assigned'}
                onOpen={() => openAssignment(hero)}
                onRecord={() => recordAssignment(hero)}
                onSwap={() => void openSwap(hero)}
              />
            </View>

            {rest.length > 0 && (
              <View>
                <PressableScale
                  accessibilityRole="button"
                  accessibilityState={{ expanded: moreOpen }}
                  style={styles.moreRow}
                  onPress={() => setMoreOpen((o) => !o)}
                >
                  <Text style={styles.moreText}>
                    {rest.length} more today
                  </Text>
                  <Icon
                    name={moreOpen ? 'chevron-up' : 'chevron-down'}
                    size={16}
                    color={color.slate500}
                  />
                </PressableScale>
                {moreOpen &&
                  rest.map((a) => (
                    <PressableScale
                      key={a.id}
                      accessibilityRole="button"
                      style={styles.upNextRow}
                      onPress={() => openAssignment(a)}
                    >
                      <View style={styles.upNextText}>
                        <Text style={styles.upNextTitle} numberOfLines={1}>
                          {a.briefs.title}
                        </Text>
                        {a.briefs.hook ? (
                          <Text style={styles.upNextHook} numberOfLines={1}>
                            {a.briefs.hook}
                          </Text>
                        ) : null}
                      </View>
                      <StatusChip status={a.status} />
                    </PressableScale>
                  ))}
              </View>
            )}
          </>
        ) : (
          <View style={styles.doneCard}>
            <Icon name="circle-check-big" size={30} color={color.green} />
            <Text style={styles.doneTitle}>Done for today</Text>
            <Text style={styles.doneSub}>All three posts are in. Nice.</Text>
            {tomorrowFirst !== undefined && (
              <PressableScale
                accessibilityRole="button"
                style={styles.peekRow}
                onPress={() => openAssignment(tomorrowFirst)}
              >
                <View style={styles.upNextText}>
                  <Text style={styles.peekLabel}>First up tomorrow</Text>
                  <Text style={styles.upNextTitle} numberOfLines={1}>
                    {tomorrowFirst.briefs.title}
                  </Text>
                </View>
                <Icon name="chevron-right" size={16} color={color.slate500} />
              </PressableScale>
            )}
          </View>
        )}
      </ScrollView>

      <SwapSheet
        visible={swapOpen}
        briefs={swapPool}
        loading={swapLoading}
        onPick={(brief) => {
          void pickSwap(brief);
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
  column: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 14,
    paddingBottom: 96,
    gap: 12,
  },
  greetingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  greeting: {
    flex: 1,
    paddingRight: 12,
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
  accountBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: color.white,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
  },
  accountBannerText: { flex: 1, gap: 1 },
  accountBannerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: color.ink,
  },
  accountBannerSub: {
    fontSize: 12,
    fontWeight: '600',
    color: color.slate500,
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
  heroFrame: {
    flex: 1,
    minHeight: 420,
  },
  emptyWrap: {
    flex: 1,
    justifyContent: 'center',
  },
  moreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
  },
  moreText: {
    fontSize: 14,
    fontWeight: '600',
    color: color.slate500,
  },
  upNextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: color.white,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: 16,
    paddingVertical: 13,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  upNextText: {
    flex: 1,
    gap: 2,
  },
  upNextTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: color.ink,
  },
  upNextHook: {
    fontSize: 13,
    color: color.slate500,
  },
  doneCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: color.white,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: 24,
    padding: 24,
  },
  doneTitle: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.4,
    color: color.ink,
  },
  doneSub: {
    fontSize: 14,
    color: color.slate500,
  },
  peekRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    alignSelf: 'stretch',
    marginTop: 16,
    backgroundColor: color.offWhite,
    borderRadius: 16,
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  peekLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: color.slate400,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
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
