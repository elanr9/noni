import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';

import { CreatorMarketScreen } from '../../../components/marketplace/CreatorMarketScreen';
import { useAuth } from '../../../lib/auth';
import type { CreatorResume, FeedListing } from '../../../lib/marketplace';
import { loadFeed, loadMyResume } from '../../../lib/marketplace-api';

/** Market tab (creator): open campaigns, invites and applications. */
export default function CreatorMarket() {
  const router = useRouter();
  const { profile } = useAuth();
  const meId = profile?.id;
  const [listings, setListings] = useState<FeedListing[] | null>(null);
  const [resume, setResume] = useState<CreatorResume | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!meId) return;
    try {
      const [feed, mine] = await Promise.all([loadFeed(), loadMyResume(meId)]);
      setListings(feed);
      setResume(mine);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setRefreshing(false);
    }
  }, [meId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <CreatorMarketScreen
      listings={listings}
      resume={resume}
      failed={failed}
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        void load();
      }}
      onOpen={(l) => router.push({ pathname: '/(creator)/market/[id]', params: { id: l.id } })}
      onEditProfile={() => router.push('/(creator)/market/profile')}
    />
  );
}
