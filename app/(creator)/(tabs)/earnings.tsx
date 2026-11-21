import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';

import { EarningsScreen } from '../../../components/creator/v2/EarningsScreen';
import { useAuth } from '../../../lib/auth';
import { loadPayoutSummary, type PayoutSummary } from '../../../lib/payouts-api';
import { toast } from '../../../components/v2/Toast';
import { NoCompanyYet } from '../../../components/marketplace/NoCompanyYet';
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
  const error = useV2Data((s) => s.error);
  const [summary, setSummary] = useState<PayoutSummary | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (companyId) void load(companyId);
  }, [companyId, load]);

  const refresh = useCallback(async (manual = false) => {
    if (!companyId || !meId) return;
    try {
      setSummary(await loadPayoutSummary(companyId, meId));
    } catch {
      // Keep what is on screen; a pull to refresh says it failed.
      if (manual) toast.error('Could not refresh your payouts', { label: 'Retry', onPress: () => void refresh(true) });
    } finally {
      setRefreshing(false);
    }
  }, [companyId, meId]);

  // Every visit after the first refetches posts too, so new views and payouts show up.
  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      void refresh();
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      if (companyId) void load(companyId, true);
    }, [refresh, companyId, load]),
  );

  const mine = useMemo(() => posts.filter((p) => p.creatorId === meId), [posts, meId]);
  if (profile && !companyId) return <NoCompanyYet title="Earnings" line="You earn $10 a video plus $1 for every 1,000 views. Join a campaign in the Market to start." />;
  return (
    <EarningsScreen
      posts={mine}
      loaded={loaded}
      summary={summary}
      refreshing={refreshing}
      failed={loaded && !!error && posts.length === 0}
      onRefresh={() => {
        setRefreshing(true);
        if (companyId) void load(companyId, true);
        void refresh(true);
      }}
      onPost={(p) => {
        if (p.assignmentId) router.push(`/(creator)/posts/${p.assignmentId}`);
      }}
      onPayouts={() => router.push('/(creator)/payouts')}
    />
  );
}
