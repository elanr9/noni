import { useEffect, useState } from 'react';
import { Redirect } from 'expo-router';

import { LoadingScreen } from '../components/Screen';
import { useAuth } from '../lib/auth';
import { hasOnboardedLocally } from '../lib/onboarding';
import { destinationForProfile } from '../lib/profile';

export default function Index() {
  const { session, profile, loading } = useAuth();
  const [returning, setReturning] = useState<boolean | null>(null);

  useEffect(() => {
    hasOnboardedLocally()
      .then(setReturning)
      .catch(() => setReturning(false));
  }, []);

  if (loading || returning === null) {
    return <LoadingScreen label="Opening Noni" />;
  }

  if (session) {
    return <Redirect href={destinationForProfile(profile, true)} />;
  }

  // Fresh install: straight into the pre-auth onboarding. Anyone who has
  // onboarded or signed in on this device before goes to sign in instead.
  return (
    <Redirect
      href={returning ? '/(auth)/login' : '/(onboarding)/welcome'}
    />
  );
}
