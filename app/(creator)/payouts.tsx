import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';

import { PayoutsScreen } from '../../components/creator/v2/PayoutsScreen';
import { useAuth } from '../../lib/auth';
import { loadPayoutSummary, type PayoutSummary } from '../../lib/payouts-api';
import { listLedger, type WalletLedgerRow } from '../../lib/wallet-api';

export default function CreatorPayouts() {
  const router = useRouter();
  const { profile } = useAuth();
  const [summary, setSummary] = useState<PayoutSummary | null>(null);
  const [ledger, setLedger] = useState<WalletLedgerRow[]>([]);

  useFocusEffect(
    useCallback(() => {
      const companyId = profile?.active_company_id;
      const meId = profile?.id;
      if (!companyId || !meId) return;
      let live = true;
      void Promise.all([loadPayoutSummary(companyId, meId), listLedger(companyId, meId)])
        .then(([s, l]) => {
          if (!live) return;
          setSummary(s);
          setLedger(l);
        })
        .catch(() => undefined);
      return () => {
        live = false;
      };
    }, [profile?.active_company_id, profile?.id]),
  );

  return <PayoutsScreen summary={summary} ledger={ledger} onBack={() => router.back()} />;
}
