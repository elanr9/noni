import { useMemo } from 'react';
import { useRouter } from 'expo-router';

import { EarningsScreen } from '../../components/creator/v2/EarningsScreen';
import type { PayoutSummary } from '../../lib/payouts-api';
import { useV2Data } from '../../lib/v2-posts';

const SUMMARY: PayoutSummary = {
  wallet: { available_cents: 124000, pending_cents: 8000, payout_ready: true } as PayoutSummary['wallet'],
  payouts: [
    { id: 'p1', amount_cents: 40000, status: 'sent', completed_at: new Date(Date.now() - 3 * 864e5).toISOString(), created_at: null },
    { id: 'p2', amount_cents: 32000, status: 'sent', completed_at: new Date(Date.now() - 10 * 864e5).toISOString(), created_at: null },
  ],
  paidCents: 72000,
};

export default function Preview() {
  const router = useRouter();
  const all = useV2Data((s) => s.posts);
  const posts = useMemo(() => all.filter((p) => p.creatorId === 'fab'), [all]);
  const loaded = useV2Data((s) => s.loaded);
  return <EarningsScreen posts={posts} loaded={loaded} summary={SUMMARY} onPost={() => undefined} onPayouts={() => router.back()} />;
}
