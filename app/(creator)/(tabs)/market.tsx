import { useCallback, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import { CreatorMarketScreen, type MarketTab } from '../../../components/marketplace/CreatorMarketScreen';
import { toast } from '../../../components/v2/Toast';
import { useAuth } from '../../../lib/auth';
import { useCompany } from '../../../lib/company-context';
import type { CreatorCampaign, CreatorResume, FeedListing } from '../../../lib/marketplace';
import { leaveCampaign, loadFeed, loadMyCampaigns, loadMyResume, loadThreadUnread } from '../../../lib/marketplace-api';

/** Campaigns tab (creator): Explore open campaigns, run every one you are in from My campaigns. */
export default function CreatorMarket() {
  const router = useRouter();
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const { profile, refreshProfile, refreshCompanies } = useAuth();
  const { switchToSide, refreshSummary } = useCompany();
  const meId = profile?.id;
  const [listings, setListings] = useState<FeedListing[] | null>(null);
  const [resume, setResume] = useState<CreatorResume | null>(null);
  const [campaigns, setCampaigns] = useState<CreatorCampaign[] | null>(null);
  const [messageUnread, setMessageUnread] = useState<Record<string, number>>({});
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!meId) return;
    try {
      const [feed, mine, list] = await Promise.all([loadFeed(), loadMyResume(meId), loadMyCampaigns()]);
      setListings(feed);
      setResume(mine);
      setCampaigns(list);
      setFailed(false);
      void loadThreadUnread(list.filter((c) => c.kind === 'applied' || c.kind === 'invited').map((c) => c.application_id))
        .then(setMessageUnread)
        .catch(() => undefined);
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

  const initialTab: MarketTab | undefined = tab === 'mine' ? 'mine' : undefined;

  return (
    <CreatorMarketScreen
      key={initialTab ?? 'explore'}
      listings={listings}
      resume={resume}
      campaigns={campaigns}
      messageUnread={messageUnread}
      failed={failed}
      refreshing={refreshing}
      initialTab={initialTab}
      onRefresh={() => {
        setRefreshing(true);
        void load();
      }}
      onOpen={(l) => router.push({ pathname: '/(creator)/market/[id]', params: { id: l.id } })}
      onOpenCampaign={async (c) => {
        if (c.kind !== 'active') {
          if (c.listing_id) router.push({ pathname: '/(creator)/market/[id]', params: { id: c.listing_id } });
          return;
        }
        try {
          await switchToSide(c.company_id, 'creator');
          router.navigate('/(creator)/(tabs)');
        } catch {
          toast.error('Could not open that campaign');
        }
      }}
      onLeave={async (c) => {
        await leaveCampaign(c.company_id);
        await Promise.all([refreshProfile(), refreshCompanies(), refreshSummary()]);
        toast.success(`Left ${c.company_name}`);
        await load();
      }}
      onEditProfile={() => router.push('/(creator)/market/profile')}
    />
  );
}
