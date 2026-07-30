import { Redirect } from 'expo-router';

import { LoadingScreen } from '../components/Screen';
import { useAuth } from '../lib/auth';
import { destinationForProfile } from '../lib/profile';

export default function Index() {
  const { session, profile, loading } = useAuth();

  if (loading) {
    return <LoadingScreen label="Opening Noni" />;
  }

  return <Redirect href={destinationForProfile(profile, !!session)} />;
}
