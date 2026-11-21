import { useRouter } from 'expo-router';

import { PayoutsScreen } from '../../components/creator/v2/PayoutsScreen';
import type { PayoutSummary } from '../../lib/payouts-api';

// Dev only: Payouts for a creator whose Mercury link went out but who has not finished.
const SUMMARY: PayoutSummary = {
  wallet: { available_cents: 6000, pending_cents: 0, payout_ready: false, mercury_invite_sent_at: new Date().toISOString(), mercury_onboarding_url: null } as PayoutSummary['wallet'],
  payouts: [],
  paidCents: 0,
};

export default function Preview() {
  const router = useRouter();
  return <PayoutsScreen summary={SUMMARY} ledger={[]} onBack={() => router.back()} />;
}
