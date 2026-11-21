import { useCallback, useEffect, useState } from 'react';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { PayoutSetupNote, PayRules, type PayoutSetupState } from '../../components/creator/v2/onboarding/PayRules';
import { toast } from '../../components/v2/Toast';
import { useAuth } from '../../lib/auth';
import { useCompanyNiche } from '../../lib/company-copy-api';
import { startPayoutSetup } from '../../lib/payouts-api';
import { getOrCreateWallet } from '../../lib/wallet-api';
import { OnboardingShell, QuietButton } from './_shell';

/** Step 2: how pay works, then bank setup through Mercury. Setup is skippable; Payouts keeps it. */
export default function EarnScreen() {
  const { session, profile } = useAuth();
  const niche = useCompanyNiche();
  const [setup, setSetup] = useState<PayoutSetupState>('unknown');
  const [busy, setBusy] = useState(false);
  const companyId = profile?.active_company_id ?? null;
  const meId = profile?.id ?? null;

  const readWallet = useCallback(async () => {
    if (!companyId || !meId) {
      setSetup('none');
      return;
    }
    try {
      const w = await getOrCreateWallet(companyId, meId);
      setSetup(w.payout_ready ? 'ready' : w.mercury_invite_sent_at ? 'sent' : 'none');
    } catch {
      setSetup('none');
    }
  }, [companyId, meId]);

  useEffect(() => {
    void readWallet();
  }, [readWallet]);

  const next = () => router.push('/(onboarding)/permissions');

  const startSetup = async () => {
    setBusy(true);
    try {
      const { alreadySetUp } = await startPayoutSetup();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setSetup(alreadySetUp ? 'ready' : 'sent');
      if (!alreadySetUp) toast.success('Link sent. Finish it whenever you like.');
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : 'Could not start payout setup. Try again.', {
        label: 'Retry',
        onPress: () => void startSetup(),
      });
    } finally {
      setBusy(false);
    }
  };

  const done = setup === 'ready' || setup === 'sent';
  const company = niche.companyName;

  return (
    <OnboardingShell
      step={2}
      onBack={() => router.back()}
      title="Every post pays you"
      subtitle={`${company ? `${company} pays` : 'You get paid'} for each post that goes live, plus the views it gets.`}
      primaryLabel={done ? 'Next' : busy ? 'Sending your link' : 'Set up payouts'}
      primaryBusy={busy}
      primaryDisabled={setup === 'unknown'}
      onPrimary={done ? next : () => void startSetup()}
      footerExtra={done ? undefined : <QuietButton label="Do this later" disabled={busy} onPress={next} />}
    >
      <PayRules />
      <PayoutSetupNote state={setup} email={session?.user.email ?? null} />
    </OnboardingShell>
  );
}
