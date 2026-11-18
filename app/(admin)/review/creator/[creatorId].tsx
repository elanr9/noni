import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import Animated, { FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated';

import { QueuePostCard } from '../../../../components/admin/v2/review/ReviewCards';
import { ErrorCard, StateCard } from '../../../../components/admin/v2/review/ReviewStates';
import { Avatar, Button, Screen, Skeleton, TextButton } from '../../../../components/v2';
import { firstName, useReviewQueue } from '../../../../lib/admin-review-queue';
import { useAuth } from '../../../../lib/auth';
import { text } from '../../../../theme/v2';

/** CreatorQueue (design_handoff_v2_review §3.2): every post one creator has waiting. */
export default function CreatorQueueScreen() {
  const { creatorId, name: nameParam } = useLocalSearchParams<{ creatorId: string; name?: string }>();
  const router = useRouter();
  const { profile } = useAuth();
  const companyId = profile?.active_company_id;

  const status = useReviewQueue((s) => s.status);
  const error = useReviewQueue((s) => s.error);
  const allPosts = useReviewQueue((s) => s.posts);
  const photo = useReviewQueue((s) => s.avatars[creatorId ?? ''] ?? null);
  const queueCompany = useReviewQueue((s) => s.companyId);
  const load = useReviewQueue((s) => s.load);
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!companyId) return;
      const ready = useReviewQueue.getState().companyId === companyId && useReviewQueue.getState().status === 'ready';
      void load(companyId, { quiet: ready });
    }, [companyId, load]),
  );

  const posts = useMemo(
    () => allPosts.filter((p) => p.creatorId === creatorId).sort((a, b) => (a.submittedAt ?? '').localeCompare(b.submittedAt ?? '')),
    [allPosts, creatorId],
  );
  const name = posts[0]?.creatorName ?? nameParam ?? 'Creator';
  const short = firstName(name);
  const loading = queueCompany !== companyId || ((status === 'loading' || status === 'idle') && posts.length === 0);
  const n = posts.length;

  return (
    <Screen
      back
      title={`${short}'s posts`}
      right={creatorId ? <TextButton label="Message" onPress={() => router.push({ pathname: '/(admin)/chat/[creatorId]', params: { creatorId } })} /> : undefined}
    >
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              if (!companyId) return;
              setRefreshing(true);
              void load(companyId, { quiet: true }).finally(() => setRefreshing(false));
            }}
          />
        }
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingTop: 8, paddingBottom: 20 }}>
          <Avatar name={name} photo={photo} size={56} />
          <Text style={text.card}>{loading ? ' ' : n === 0 ? 'All caught up' : `${n} to review`}</Text>
        </View>
        {loading ? (
          [0, 1, 2].map((i) => <Skeleton key={i} h={92} />)
        ) : status === 'error' && n === 0 ? (
          <ErrorCard message={error} onRetry={() => companyId && void load(companyId)} />
        ) : n === 0 ? (
          <StateCard icon="check_circle" tone="green" title={`All caught up with ${short}.`} body="New posts from them land here and in Review the moment they submit.">
            <View style={{ flexDirection: 'row' }}>
              <Button label="Return to review" variant="secondary" onPress={() => router.back()} />
            </View>
          </StateCard>
        ) : (
          posts.map((p, i) => (
            <Animated.View key={p.id} entering={FadeInDown.duration(260).delay(Math.min(i, 6) * 40)} exiting={FadeOut.duration(180)} layout={LinearTransition.duration(240)}>
              <QueuePostCard post={p} onPress={() => router.push({ pathname: '/(admin)/review/[id]', params: { id: p.id, creator: p.creatorId } })} />
            </Animated.View>
          ))
        )}
      </ScrollView>
    </Screen>
  );
}
