// A creator's post that is not live yet (v2): status, the sent media, the
// manager's notes and the next step. Live posts hand over to posts/[id].
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import { forgetPostDrafts } from '../../../components/creator/v2/record/model';
import { PostDetailScreen } from '../../../components/creator/v2/PostDetailScreen';
import { toast } from '../../../components/v2/Toast';
import { useAuth } from '../../../lib/auth';
import { loadCreatorPostDetail, type CreatorPostDetail } from '../../../lib/creator-post-detail';
import { discardCreatorPost } from '../../../lib/creator-posts-api';
import { useV2Data } from '../../../lib/v2-posts';

export default function CreatorPostDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { profile } = useAuth();
  const companyId = profile?.active_company_id ?? null;
  const [detail, setDetail] = useState<CreatorPostDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const seq = useRef(0);
  const shown = useRef(false);
  const retry = useRef<() => void>(() => undefined);

  const load = useCallback(
    async (manual = false) => {
      if (!companyId || !id) return;
      const mine = ++seq.current;
      try {
        const next = await loadCreatorPostDetail(companyId, id);
        if (mine !== seq.current) return;
        if (!next) {
          setDetail(null);
          setError('missing');
          return;
        }
        setError(null);
        shown.current = true;
        setDetail(next);
      } catch {
        if (mine !== seq.current) return;
        // Keep what is on screen; only an empty screen turns into the error state.
        if (!shown.current) setError('failed');
        else if (manual) toast.error('Could not refresh this post.', { label: 'Retry', onPress: () => retry.current() });
      } finally {
        if (mine === seq.current) setRefreshing(false);
      }
    },
    [companyId, id],
  );

  useEffect(() => {
    retry.current = () => void load(true);
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <PostDetailScreen
      detail={detail}
      error={error}
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        void load(true);
      }}
      onRetry={() => {
        setError(null);
        void load();
      }}
      onContinue={() => {
        if (id) router.push({ pathname: '/(creator)/resume/[id]', params: { id } });
      }}
      onStats={() => {
        if (id) router.replace({ pathname: '/(creator)/posts/[id]', params: { id } });
      }}
      onDiscard={async () => {
        if (!id || !detail) return;
        await discardCreatorPost(id);
        await forgetPostDrafts(id, detail.assignment.library_brief_id ?? null);
        if (companyId) void useV2Data.getState().load(companyId, true);
        toast.success('Post discarded');
        router.back();
      }}
    />
  );
}
