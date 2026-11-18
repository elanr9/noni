import { useCallback, useRef, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';

import { PayoutsScreen } from '../../components/creator/v2/PayoutsScreen';
import { toast } from '../../components/v2/Toast';
import { useAuth } from '../../lib/auth';
import { loadPayoutSummary, type PayoutSummary } from '../../lib/payouts-api';
import { listLedger, type WalletLedgerRow } from '../../lib/wallet-api';

export default function CreatorPayouts() {
  const router = useRouter();
  const { profile } = useAuth();
  const companyId = profile?.active_company_id ?? null;
  const meId = profile?.id ?? null;
  const [summary, setSummary] = useState<PayoutSummary | null>(null);
  const [ledger, setLedger] = useState<WalletLedgerRow[]>([]);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const seq = useRef(0);
  const shown = useRef(false);

  const load = useCallback(
    async (manual: boolean) => {
      if (!companyId || !meId) return;
      const mine = ++seq.current;
      try {
        const [s, l] = await Promise.all([loadPayoutSummary(companyId, meId), listLedger(companyId, meId)]);
        if (mine !== seq.current) return;
        setSummary(s);
        setLedger(l);
        setFailed(false);
        shown.current = true;
      } catch {
        if (mine !== seq.current) return;
        // Nothing on screen yet: the error card with Retry. Otherwise keep the figures.
        if (!shown.current) setFailed(true);
        else if (manual) toast.error('Could not refresh your payouts', { label: 'Retry', onPress: () => void load(true) });
      } finally {
        if (mine === seq.current) setRefreshing(false);
      }
    },
    [companyId, meId],
  );

  useFocusEffect(
    useCallback(() => {
      void load(false);
      return () => {
        seq.current += 1;
      };
    }, [load]),
  );

  return (
    <PayoutsScreen
      summary={summary}
      ledger={ledger}
      failed={failed}
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        if (failed) setFailed(false);
        void load(true);
      }}
      onBack={() => router.back()}
    />
  );
}
