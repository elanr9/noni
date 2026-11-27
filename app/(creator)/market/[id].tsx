import { useCallback, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import { ListingScreen } from '../../../components/marketplace/ListingScreen';
import { Empty, Screen } from '../../../components/v2';
import { toast } from '../../../components/v2/Toast';
import { useAuth } from '../../../lib/auth';
import type { CreatorResume, FeedListing } from '../../../lib/marketplace';
import { applyToListing, loadFeed, loadMyResume, loadThreadUnread, signAgreement, withdrawApplication } from '../../../lib/marketplace-api';
import { color } from '../../../theme/v2';

/** One campaign: read it and apply; once accepted, sign the agreement made for you. */
export default function CreatorListing() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile, switchCompany, refreshCompanies, refreshProfile } = useAuth();
  const meId = profile?.id;
  const [listing, setListing] = useState<FeedListing | null | undefined>(undefined);
  const [resume, setResume] = useState<CreatorResume | null>(null);
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    if (!meId) return;
    try {
      const [feed, mine] = await Promise.all([loadFeed(), loadMyResume(meId)]);
      const found = feed.find((l) => l.id === id) ?? null;
      setListing(found);
      setResume(mine);
      if (found?.application_id) {
        const appId = found.application_id;
        void loadThreadUnread([appId])
          .then((u) => setUnread(u[appId] ?? 0))
          .catch(() => undefined);
      }
    } catch {
      setListing((cur) => cur ?? null);
    }
  }, [meId, id]);

  // Refetch on return from the profile editor, so the Apply button unlocks.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (listing === undefined) {
    return (
      <Screen back>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={color.grey4} />
        </View>
      </Screen>
    );
  }
  if (listing === null) {
    return (
      <Screen back title="Campaign">
        <View style={{ padding: 20 }}>
          <Empty>This campaign is no longer open.</Empty>
        </View>
      </Screen>
    );
  }

  return (
    <ListingScreen
      listing={listing}
      resume={resume}
      defaultName={profile?.full_name?.trim() ?? ''}
      unread={unread}
      onMessagesRead={() => setUnread(0)}
      onBack={() => router.back()}
      onEditProfile={() => router.push('/(creator)/market/profile')}
      onApply={async () => {
        const result = await applyToListing(listing.id);
        await load();
        return result;
      }}
      onSign={async (name) => {
        if (!listing.application_id) throw new Error('There is nothing to sign yet');
        const result = await signAgreement(listing.application_id, name);
        // Signing joins on the spot: the new company must be in the switcher.
        if (result.status === 'accepted') await Promise.all([refreshCompanies(), refreshProfile()]).catch(() => undefined);
        return result;
      }}
      onWithdraw={async () => {
        if (!listing.application_id) return;
        try {
          await withdrawApplication(listing.application_id);
          toast.show('Application withdrawn');
          await load();
        } catch (e) {
          toast.error(e instanceof Error ? e.message : 'Could not withdraw');
        }
      }}
      onEnterCompany={async () => {
        try {
          await refreshCompanies();
          if (profile?.active_company_id !== listing.company_id) await switchCompany(listing.company_id, 'creator');
          router.replace('/(creator)/(tabs)');
        } catch (e) {
          toast.error(e instanceof Error ? e.message : 'Could not open that company');
        }
      }}
    />
  );
}
