import { Redirect } from 'expo-router';

import { LoadingScreen } from '../../components/layout/Screen';
import { useAuth } from '../../lib/auth';

export default function OnboardingIndex() {
  const { profile, loading } = useAuth();

  if (loading) return <LoadingScreen />;

  // The layout already bounced missing sessions, missing profiles, and
  // onboarded users.
  if (profile?.role === 'admin') {
    return <Redirect href="/platform-admin" />;
  }

  if (profile?.role === 'company_admin') {
    return <Redirect href="/company-admin" />;
  }

  if (profile?.role === 'campaign_manager') {
    return <Redirect href="/(onboarding)/manager" />;
  }

  return <Redirect href="/(onboarding)/name" />;
}
