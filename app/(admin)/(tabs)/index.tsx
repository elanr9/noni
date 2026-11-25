import { useCallback, useMemo, useRef, useState } from 'react';
import { RefreshControl, ScrollView, Text, View, type ScrollViewInstance } from 'react-native';
import { useFocusEffect, useRouter, useScrollToTop } from 'expo-router';
import Animated, { FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import { InviteCreatorsSheet } from '../../../components/admin/v2/review/InviteCreatorsSheet';
import { AccountCard, ApplicantCard, CreatorQueueCard, MusicCard } from '../../../components/admin/v2/review/ReviewCards';
import { ErrorCard, PostsEmpty, StateCard } from '../../../components/admin/v2/review/ReviewStates';
import { CreatorSheet } from '../../../components/marketplace/AdminSheets';
import { ContextRow, ElsewhereStrip } from '../../../components/shared';
import { Icon as LineIcon } from '../../../components/ui/Icon';
import { Chip, Press, Seg, Skeleton, TabPane, useTabBarInset } from '../../../components/v2';
import { toast } from '../../../components/v2/Toast';
import { useAuth } from '../../../lib/auth';
import { firstName, groupByCreator, pendingAccounts, reviewTotal, useReviewQueue } from '../../../lib/admin-review-queue';
import { useCompany } from '../../../lib/company-context';
import { dayLabel, type MarketCreator } from '../../../lib/marketplace';
import { decideApplication } from '../../../lib/marketplace-api';
import { isManagerSetupCompleteFlag } from '../../../lib/profile';
import { color, radius, shadow, text } from '../../../theme/v2';

type Lane = 'posts' | 'music' | 'accounts' | 'creators';

/** Spec: a short skeleton before content so the list never flashes in half loaded. */
const SKELETON_MS = 500;

function BellButton({ count, onPress }: { count: number; onPress: () => void }) {
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={count > 0 ? `Notifications, ${count} unread` : 'Notifications'}
      onPress={onPress}
      style={{ width: 40, height: 40, borderRadius: radius.pill, backgroundColor: color.card, alignItems: 'center', justifyContent: 'center', ...shadow.card }}
    >
      <LineIcon name="bell" size={19} color={color.ink} />
      {count > 0 ? (
        <View style={{ position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: radius.pill, backgroundColor: color.blue, alignItems: 'center', justifyContent: 'center', boxShadow: `0 0 0 2px ${color.bg}` }}>
          <Text style={{ fontSize: 11, lineHeight: 14, fontWeight: '700', color: color.white }}>{count > 99 ? '99+' : count}</Text>
        </View>
      ) : null}
    </Press>
  );
}

/** Wraps a list card: rises in, fades out when approved, neighbours slide up. */
function Item({ children, index }: { children: React.ReactNode; index: number }) {
  return (
    <Animated.View entering={FadeInDown.duration(260).delay(Math.min(index, 6) * 40)} exiting={FadeOut.duration(180)} layout={LinearTransition.duration(240)}>
      {children}
    </Animated.View>
  );
}

export default function ReviewScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bottom = useTabBarInset();
  const { profile, managerAccess } = useAuth();
  const { openNotifications, unreadNotifications } = useCompany();
  const companyId = profile?.active_company_id;

  const status = useReviewQueue((s) => s.status);
  const error = useReviewQueue((s) => s.error);
  const posts = useReviewQueue((s) => s.posts);
  const music = useReviewQueue((s) => s.music);
  const accounts = useReviewQueue((s) => s.accounts);
  const applicants = useReviewQueue((s) => s.applicants);
  const avatars = useReviewQueue((s) => s.avatars);
  const creatorCount = useReviewQueue((s) => s.creatorCount);
  const queueCompany = useReviewQueue((s) => s.companyId);
  const load = useReviewQueue((s) => s.load);

  const [lane, setLane] = useState<Lane>('posts');
  const [refreshing, setRefreshing] = useState(false);
  const [held, setHeld] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [openApplicant, setOpenApplicant] = useState<MarketCreator | null>(null);

  const scrollRef = useRef<ScrollViewInstance>(null);
  useScrollToTop(scrollRef);

  useFocusEffect(
    useCallback(() => {
      if (!companyId) return;
      const ready = useReviewQueue.getState().companyId === companyId && useReviewQueue.getState().status === 'ready';
      void load(companyId, { quiet: ready });
      if (ready) {
        setHeld(false);
        return;
      }
      setHeld(true);
      const t = setTimeout(() => setHeld(false), SKELETON_MS);
      return () => clearTimeout(t);
    }, [companyId, load]),
  );

  const onRefresh = useCallback(async () => {
    if (!companyId) return;
    setRefreshing(true);
    await load(companyId, { quiet: true });
    setRefreshing(false);
  }, [companyId, load]);

  const groups = useMemo(() => groupByCreator(posts, avatars), [posts, avatars]);
  const pending = pendingAccounts(accounts);
  const total = reviewTotal({ posts, music, accounts, applicants });
  const loading = queueCompany !== companyId || status === 'idle' || (status === 'loading' && !refreshing) || held;
  const failed = status === 'error';

  const openPost = (id: string, creatorId?: string) =>
    router.push({ pathname: '/(admin)/review/[id]', params: creatorId ? { id, creator: creatorId } : { id } });
  const openCreator = (creatorId: string) => router.push({ pathname: '/(admin)/review/creator/[creatorId]', params: { creatorId } });
  const openCreators = () => router.push('/(admin)/creators');
  const setupIncomplete = profile?.role === 'campaign_manager' && !isManagerSetupCompleteFlag(profile.onboarding_answers, profile.active_company_id);

  /** Leaves the lane at once; comes back and says so if the server refuses. */
  const decideApplicant = (c: MarketCreator, accept: boolean) => {
    if (!c.application_id) return;
    const restore = useReviewQueue.getState().removeApplicant(c.application_id);
    setOpenApplicant(null);
    const first = firstName(c.full_name?.trim() || 'Creator');
    if (accept) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    void decideApplication(c.application_id, accept)
      .then((r) => {
        if (!accept) return toast.show(`Declined ${first}`);
        const due = dayLabel(r.start_date);
        toast.success(due ? `${first} is on your team. First post due ${due}.` : `${first} is on your team`);
        if (companyId) void load(companyId, { quiet: true });
      })
      .catch((e: unknown) => {
        restore();
        toast.error(`Could not save: ${e instanceof Error ? e.message : 'try again'}`);
      });
  };

  const body = () => {
    if (loading && !failed) {
      return [0, 1, 2, 3].map((i) => <Skeleton key={i} h={76} />);
    }
    if (failed && total === 0) {
      return <ErrorCard message={error} onRetry={() => companyId && void load(companyId)} />;
    }
    if (lane === 'posts') {
      if (groups.length === 0) {
        return (
          <PostsEmpty
            noCreators={creatorCount === 0}
            canInvite={managerAccess.inviteCreators}
            onInvite={() => setInviteOpen(true)}
            onCreators={openCreators}
            onNewBrief={() => router.push({ pathname: '/(admin)/new-brief', params: { slot: 'new' } })}
            onSetup={setupIncomplete ? () => router.push('/(admin)/(tabs)/setup') : undefined}
          />
        );
      }
      return groups.map((g, i) => (
        <Item key={g.creatorId} index={i}>
          <CreatorQueueCard group={g} onPress={() => openCreator(g.creatorId)} onPost={(id) => openPost(id, g.creatorId)} />
        </Item>
      ));
    }
    if (lane === 'music') {
      if (music.length === 0) {
        return <StateCard icon="music_note" tone="purple" title="No songs waiting." body="When a creator adds the sound to a live slideshow and marks it added, the song lands here for you to check." />;
      }
      return music.map((m, i) => (
        <Item key={m.assignment.id} index={i}>
          <MusicCard item={m} photo={avatars[m.assignment.creator_id] ?? null} onPress={() => router.push({ pathname: '/(admin)/music/[id]', params: { id: m.assignment.id } })} />
        </Item>
      ));
    }
    if (lane === 'creators') {
      if (applicants.length === 0) {
        return <StateCard icon="group" tone="green" title="No creators waiting." />;
      }
      return applicants.map((c, i) => (
        <Item key={c.application_id ?? c.creator_id} index={i}>
          <ApplicantCard creator={c} photo={avatars[c.creator_id] ?? null} onPress={() => setOpenApplicant(c)} onDecide={(accept) => decideApplicant(c, accept)} />
        </Item>
      ));
    }
    if (accounts.length === 0) {
      return (
        <StateCard
          icon="person"
          tone="amber"
          title="No accounts waiting."
          body={creatorCount === 0 ? 'Invited creators set up their TikTok and Instagram, then their accounts land here for you to approve.' : 'Every creator on the roster is linked.'}
        />
      );
    }
    return accounts.map((a, i) => (
      <Item key={a.id} index={i}>
        <AccountCard account={a} photo={avatars[a.creator_id] ?? null} onPress={() => router.push({ pathname: '/(admin)/account-approval/[accountId]', params: { accountId: a.id } })} />
      </Item>
    ));
  };

  return (
    <View style={{ flex: 1, backgroundColor: color.bg, paddingTop: insets.top }}>
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: bottom }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={color.grey3} />}
      >
        <ContextRow right={<BellButton count={unreadNotifications} onPress={openNotifications} />} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 8, paddingBottom: 8 }}>
          <Text style={text.title}>Review</Text>
          {loading ? null : total > 0 ? <Chip icon="schedule" label={`${total} waiting`} /> : <Chip icon="check" tone="green" label="All clear" />}
        </View>
        <ElsewhereStrip style={{ marginTop: 4, marginBottom: 4 }} />
        <Seg<Lane>
          style={{ marginTop: 8, marginBottom: 16 }}
          value={lane}
          onChange={setLane}
          options={[
            { key: 'posts', label: 'Posts', count: loading ? undefined : posts.length, tone: 'blue' },
            { key: 'music', label: 'Music', count: loading ? undefined : music.length, tone: 'purple' },
            { key: 'accounts', label: 'Accounts', count: loading ? undefined : pending.length, tone: 'amber' },
            { key: 'creators', label: 'Creators', count: loading ? undefined : applicants.length, tone: 'green' },
          ]}
        />
        {failed && total > 0 ? (
          <Press accessibilityRole="button" onPress={() => companyId && void load(companyId)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, marginBottom: 12, borderRadius: radius.option, backgroundColor: color.pinkTint }}>
            <Text style={[text.meta, { flex: 1, color: color.pink }]}>Could not refresh. Showing the last list. Tap to retry.</Text>
          </Press>
        ) : null}
        <TabPane k={loading ? 'loading' : lane}>{body()}</TabPane>
      </ScrollView>
      <CreatorSheet
        creator={openApplicant}
        photo={openApplicant ? (avatars[openApplicant.creator_id] ?? null) : null}
        listing={null}
        onClose={() => setOpenApplicant(null)}
        onInvite={() => undefined}
        onDecide={decideApplicant}
      />
      <InviteCreatorsSheet open={inviteOpen} companyId={companyId} onClose={() => setInviteOpen(false)} onSent={() => companyId && void load(companyId, { quiet: true })} />
    </View>
  );
}
