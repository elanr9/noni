import { useState } from 'react';
import { router } from 'expo-router';

import { useAuth } from '../../lib/auth';
import { registerPushToken } from '../../lib/notifications';
import { OnboardingShell, QuietButton, StepCard } from './_shell';

/** Step 4: push, so a new brief or a review never waits on the creator opening the app. */
export default function NotificationsScreen() {
  const { session } = useAuth();
  const [busy, setBusy] = useState(false);
  const next = () => router.push('/(onboarding)/connect');

  const allow = async () => {
    setBusy(true);
    // Never throws; a denied prompt just means no pushes until Settings.
    if (session) await registerPushToken(session.user.id);
    setBusy(false);
    next();
  };

  return (
    <OnboardingShell
      step={4}
      onBack={() => router.back()}
      title="Turn on notifications"
      subtitle="We tell you when there is something to record and when your team reviews a post."
      primaryLabel="Allow notifications"
      primaryBusy={busy}
      onPrimary={() => void allow()}
      footerExtra={<QuietButton label="Not now" disabled={busy} onPress={next} />}
    >
      <StepCard icon="inbox" label="New briefs" hint="A post is ready for you to record." />
      <StepCard icon="mark_chat_unread" label="Reviews and messages" hint="Your post is approved, or your team asks for a change." />
      <StepCard icon="trending_up" label="Going live" hint="Your post is up and earning views." />
    </OnboardingShell>
  );
}
