import { Redirect } from 'expo-router';

import { ActivityIndicator, View } from 'react-native';

import { color } from '../../theme/v2';
import { useAuth } from '../../lib/auth';

export default function OnboardingIndex() {
  const { profile, loading } = useAuth();

  if (loading) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: color.bg }}><ActivityIndicator color={color.grey4} /></View>;

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

  // Creators: name, how pay works, camera and mic, notifications, connect, a practice take,
  // then the finish screen.
  return <Redirect href="/(onboarding)/name" />;
}
