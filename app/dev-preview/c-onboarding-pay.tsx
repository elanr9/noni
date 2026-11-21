import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { PayoutSetupNote, PayRules, type PayoutSetupState } from '../../components/creator/v2/onboarding/PayRules';
import { OnboardingShell, QuietButton } from '../(onboarding)/_shell';

/** Dev only: onboarding step 2 (how pay works) with no session. ?state=none|sent|ready */
export default function Preview() {
  const router = useRouter();
  const params = useLocalSearchParams<{ state?: PayoutSetupState }>();
  const [setup, setSetup] = useState<PayoutSetupState>(params.state ?? 'none');
  const done = setup === 'sent' || setup === 'ready';
  return (
    <OnboardingShell
      step={2}
      onBack={() => router.back()}
      title="Every post pays you"
      subtitle="Inkbound pays for each post that goes live, plus the views it gets."
      primaryLabel={done ? 'Next' : 'Set up payouts'}
      onPrimary={() => setSetup(done ? 'none' : 'sent')}
      footerExtra={done ? undefined : <QuietButton label="Do this later" onPress={() => setSetup('ready')} />}
    >
      <PayRules />
      <PayoutSetupNote state={setup} email="maya@example.com" />
    </OnboardingShell>
  );
}
