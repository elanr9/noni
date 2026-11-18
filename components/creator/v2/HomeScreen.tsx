// Creator Home (V2Library.jsx CreatorHomeScreen): a greeting, three figures
// and this week's posts with their state, under the company pill, the bell and
// the strip that says another company needs you. Payout figures live under Earnings.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useFocusEffect } from 'expo-router';

import { useCompany } from '../../../lib/company-context';
import { addDays, fmt, money, sunday, today } from '../../../lib/v2-format';
import { usePostFrame } from '../../../lib/v2-media';
import { creatorById, useV2Data, type V2Post } from '../../../lib/v2-posts';
import { color, num, space, stateTone, text } from '../../../theme/v2';
import { ContextRow, ElsewhereStrip } from '../../shared';
import { Button, Card, Chip, Empty, Icon, Press, Row, Screen, SectionTitle, Sheet, Skeleton, Thumb, useTabBarInset } from '../../v2';
import { toast } from '../../v2/Toast';
import { BellButton } from './BellButton';
import { LoadError } from './LoadError';

export interface HomeScreenProps {
  meId: string;
  firstName: string;
  onPost: (p: V2Post) => void;
  /** Throws away an unfinished post; rejects with a message to show. */
  onDiscard?: (p: V2Post) => Promise<void>;
  /** Wallet credits this month in the active company, cents; null while loading or when it failed. */
  earnedCents?: number | null;
  onEarnings?: () => void;
}

function Num({ value, label, tone }: { value: string | number; label: string; tone?: 'amber' }) {
  return (
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text style={[num.lg, tone === 'amber' ? { color: color.amber } : null]}>{value}</Text>
      <Text numberOfLines={1} style={text.meta}>{label}</Text>
    </View>
  );
}

function PostRow({ p, last, onPress, onDiscard }: { p: V2Post; last: boolean; onPress: () => void; onDiscard?: () => void }) {
  const frame = usePostFrame(p);
  return (
    <Row last={last} chevron={!onDiscard} onPress={onPress}>
      <Thumb w={40} radius={8} post={{ frame, title: p.title, format: p.format }} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={text.row}>{p.title}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
          <Chip small tone={stateTone[p.state]} label={p.state === 'Recording' ? 'Draft' : p.state === 'Waiting' ? 'In review' : p.state} />
          {p.state === 'Recording' ? <Text style={text.meta}>Tap to continue</Text> : null}
        </View>
      </View>
      {onDiscard ? (
        <Press accessibilityRole="button" accessibilityLabel={`Discard ${p.title}`} onPress={onDiscard} hitSlop={6} style={{ width: 40, height: 40, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: color.grey1 }}>
          <Icon name="delete" size={20} color={color.grey4} />
        </Press>
      ) : null}
    </Row>
  );
}

export function HomeScreen({ meId, firstName, onPost, onDiscard, earnedCents = null, onEarnings }: HomeScreenProps) {
  const { openNotifications, unreadNotifications } = useCompany();
  const posts = useV2Data((s) => s.posts);
  const creators = useV2Data((s) => s.creators);
  const loaded = useV2Data((s) => s.loaded);
  const error = useV2Data((s) => s.error);
  const companyId = useV2Data((s) => s.companyId);
  const load = useV2Data((s) => s.load);
  const barInset = useTabBarInset();
  const [refreshing, setRefreshing] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const me = creatorById(creators, meId);
  const mine = useMemo(() => posts.filter((p) => p.creatorId === meId), [posts, meId]);
  // Unfinished posts stay up top until they are sent or discarded, whatever week they started.
  const drafts = useMemo(() => mine.filter((p) => p.state === 'Recording').sort((a, b) => b.date.getTime() - a.date.getTime()), [mine]);
  const week = useMemo(() => {
    const start = sunday(today());
    const end = addDays(start, 7);
    return mine.filter((p) => p.state !== 'Recording' && p.date >= start && p.date < end).sort((a, b) => a.date.getTime() - b.date.getTime()).slice(0, 6);
  }, [mine]);
  const [discard, setDiscard] = useState<V2Post | null>(null);
  const [discarding, setDiscarding] = useState(false);
  const confirmDiscard = async () => {
    if (!discard || !onDiscard) return;
    setDiscarding(true);
    try {
      await onDiscard(discard);
      setDiscard(null);
      toast.success('Post discarded');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not discard this post');
    } finally {
      setDiscarding(false);
    }
  };
  const posted = mine.filter((p) => p.state === 'Posted').length;
  const waiting = mine.filter((p) => p.state === 'Waiting').length;
  const failed = loaded && !!error && posts.length === 0;

  const refetch = useCallback(async () => {
    if (!companyId || companyId === 'preview') return;
    await load(companyId, true);
  }, [companyId, load]);

  // Coming back to Home picks up posts sent or reviewed since; the figures stay on screen meanwhile.
  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      void refetch();
    }, [refetch]),
  );

  // A failed refresh keeps the last posts on screen and says so.
  const shownBefore = useRef(false);
  useEffect(() => {
    if (loaded && posts.length > 0) shownBefore.current = true;
  }, [loaded, posts.length]);
  useEffect(() => {
    if (error && shownBefore.current) toast.error('Could not refresh your posts', { label: 'Retry', onPress: () => void refetch() });
  }, [error, refetch]);

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };
  const onRetry = async () => {
    setRetrying(true);
    await refetch();
    setRetrying(false);
  };

  return (
    // The list scrolls under the floating tab bar, so the inset rides on the content.
    <Screen>
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: space.screen, paddingBottom: barInset }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={color.grey4} />}
      >
        <ContextRow right={<BellButton count={unreadNotifications} onPress={openNotifications} />} />
        <Text style={[text.title, { paddingTop: 8 }]}>{`Hi ${firstName}`}</Text>
        <View style={{ flexDirection: 'row', minHeight: 26, marginTop: 6, marginBottom: 12 }}>
          {earnedCents !== null ? (
            <Animated.View entering={FadeIn.duration(200)}>
              <Press accessibilityRole="button" accessibilityLabel={`${money(earnedCents)} earned this month. Open earnings`} onPress={onEarnings} disabled={!onEarnings}>
                <Chip tone="green" icon="payments" label={`${money(earnedCents)} this month`} />
              </Press>
            </Animated.View>
          ) : null}
        </View>
        <ElsewhereStrip style={{ marginBottom: 12 }} />
        {!loaded ? (
          <>
            <Skeleton h={92} />
            <Skeleton h={76} />
            <Skeleton h={76} />
          </>
        ) : failed ? (
          <LoadError title="Could not load your posts" onRetry={() => void onRetry()} retrying={retrying} />
        ) : (
          <Animated.View entering={FadeIn.duration(220)}>
            <Card style={{ flexDirection: 'row', gap: 12 }}>
              <Num value={posted} label="posted" />
              <Num value={fmt(me?.views ?? mine.reduce((n, p) => n + p.views, 0))} label="views" />
              <Num value={waiting} label="in review" tone="amber" />
            </Card>
            {drafts.length ? (
              <>
                <SectionTitle>Drafts</SectionTitle>
                <Card pad={0} style={{ paddingVertical: 4, paddingHorizontal: 16 }}>
                  {drafts.map((p, i) => (
                    <PostRow key={p.id} p={p} last={i === drafts.length - 1} onPress={() => onPost(p)} onDiscard={onDiscard ? () => setDiscard(p) : undefined} />
                  ))}
                </Card>
              </>
            ) : null}
            <SectionTitle>This week</SectionTitle>
            {week.length ? (
              <Card pad={0} style={{ paddingVertical: 4, paddingHorizontal: 16 }}>
                {week.map((p, i) => <PostRow key={p.id} p={p} last={i === week.length - 1} onPress={() => onPost(p)} />)}
              </Card>
            ) : (
              <Empty>{drafts.length ? 'Nothing sent this week yet.' : 'Nothing this week. Tap Create to start a post.'}</Empty>
            )}
          </Animated.View>
        )}
      </ScrollView>
      <Sheet
        open={discard !== null}
        onClose={() => (discarding ? undefined : setDiscard(null))}
        title="Discard this draft?"
        footer={
          <>
            <Button variant="quiet" label="Keep it" disabled={discarding} onPress={() => setDiscard(null)} />
            <Button variant="ink" label={discarding ? 'Discarding' : 'Discard'} disabled={discarding} onPress={() => void confirmDiscard()} />
          </>
        }
      >
        <Text style={[text.body, { color: color.grey4 }]}>{discard ? `"${discard.title}" and its clips are deleted. This cannot be undone.` : ''}</Text>
      </Sheet>
    </Screen>
  );
}
