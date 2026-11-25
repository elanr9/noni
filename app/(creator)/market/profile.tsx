import { useRouter } from 'expo-router';

import { MyProfile } from '../../../components/marketplace/MyProfile';

/** The creator's profile, pushed from the Market. */
export default function CreatorMarketProfile() {
  const router = useRouter();
  return <MyProfile onBack={() => router.back()} />;
}
