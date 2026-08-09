import { Redirect } from 'expo-router';

import { LoadingScreen } from '../../components/layout/Screen';
import { useAuth } from '../../lib/auth';

export default function OnboardingIndex() {
  const { session, profile, loading } = useAuth();

  if (loading) return <LoadingScreen />;

  if (session && profile?.role === 'admin') {
    return <Redirect href="/(onboarding)/company" />;
  }

  // A signed-in creator who is not onboarded already passed the save step,
  // so resume at the first post-auth question.
  if (session && profile) {
    return <Redirect href="/(onboarding)/heard" />;
  }

  return <Redirect href="/(onboarding)/welcome" />;
}
