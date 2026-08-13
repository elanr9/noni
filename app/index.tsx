import { Redirect } from 'expo-router';

import { LoadingScreen } from '../components/Screen';
import { useAuth } from '../lib/auth';
import { destinationForProfile } from '../lib/profile';

export default function Index() {
  const { session, profile, loading, activeMode } = useAuth();

  if (loading) {
    return <LoadingScreen label="Opening Noni" />;
  }

  // Noni is invite only: there is no pre-auth onboarding, everyone signs in.
  return (
    <Redirect
      href={destinationForProfile(profile, session !== null, activeMode)}
    />
  );
}
