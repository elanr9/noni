import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';

import { EarningsScreen } from '../../../components/creator/v2/EarningsScreen';
import { useAuth } from '../../../lib/auth';
import { loadPayoutSummary, type PayoutSummary } from '../../../lib/payouts-api';
import { useV2Data } from '../../../lib/v2-posts';

/** Earnings tab: the creator's own analytics and payout figures. */
export default function CreatorEarnings() {
  const router = useRouter();
  const { profile } = useAuth();
  const companyId = profile?.active_company_id;
  const meId = profile?.id;
  const posts = useV2Data((s) => s.posts);
  const loaded = useV2Data((s) => s.loaded);
  const load = useV2Data((s) => s.load);
  const [summary, setSummary] = useState<PayoutSummary | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (companyId) void load(companyId);
  }, [companyId, load]);

  const refresh = useCallback(async () => {
    if (!companyId || !meId) return;
    try {
      setSummary(await loadPayoutSummary(companyId, meId));
    } catch {
      // Keep what is on screen.
    } finally {
      setRefreshing(false);
    }
  }, [companyId, meId]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const mine = useMemo(() => posts.filter((p) => p.creatorId === meId), [posts, meId]);
  return (
    <EarningsScreen
      posts={mine}
      loaded={loaded}
      summary={summary}
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        if (companyId) void load(companyId, true);
        void refresh();
      }}
      onPost={(p) => {
        if (p.assignmentId) router.push(`/(creator)/posts/${p.assignmentId}`);
      }}
      onPayouts={() => router.push('/(creator)/payouts')}
    />
  );
}
