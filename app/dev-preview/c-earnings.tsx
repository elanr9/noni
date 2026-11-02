import { useRouter } from 'expo-router';

import { EarningsScreen } from '../../components/creator/v2/EarningsScreen';
import type { PayoutSummary } from '../../lib/payouts-api';
import { useV2Data } from '../../lib/v2-posts';

const SUMMARY: PayoutSummary = {
  wallet: { available_cents: 124000, pending_cents: 8000, payout_ready: true } as PayoutSummary['wallet'],
  payouts: [
    { id: 'p1', amount_cents: 40000, company_id: 'c', creator_id: 'fab', status: 'completed', completed_at: new Date(Date.now() - 3 * 864e5).toISOString(), created_at: null, stripe_transfer_id: null },
    { id: 'p2', amount_cents: 32000, company_id: 'c', creator_id: 'fab', status: 'completed', completed_at: new Date(Date.now() - 10 * 864e5).toISOString(), created_at: null, stripe_transfer_id: null },
  ],
  paidCents: 72000,
};

export default function Preview() {
  const router = useRouter();
  const posts = useV2Data((s) => s.posts.filter((p) => p.creatorId === 'fab'));
  const loaded = useV2Data((s) => s.loaded);
  return <EarningsScreen posts={posts} loaded={loaded} summary={SUMMARY} onPost={() => undefined} onPayouts={() => router.back()} />;
}
