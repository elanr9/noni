import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useRouter } from 'expo-router';

import { ListingEditor } from '../../../components/marketplace/ListingEditor';
import { Screen } from '../../../components/v2';
import { toast } from '../../../components/v2/Toast';
import { useAuth } from '../../../lib/auth';
import type { Listing } from '../../../lib/marketplace';
import { loadMyListings, saveListing } from '../../../lib/marketplace-api';
import { color } from '../../../theme/v2';

/** The company's campaign and the agreement creators sign to apply. */
export default function AdminMarketListing() {
  const router = useRouter();
  const { profile, activeCompany } = useAuth();
  const companyId = profile?.active_company_id;
  const [listing, setListing] = useState<Listing | null | undefined>(undefined);

  useEffect(() => {
    if (!companyId) return;
    let off = false;
    void loadMyListings(companyId)
      .then((rows) => {
        if (!off) setListing(rows.find((l) => l.status === 'open') ?? rows[rows.length - 1] ?? null);
      })
      .catch(() => {
        if (!off) setListing(null);
      });
    return () => {
      off = true;
    };
  }, [companyId]);

  if (listing === undefined) {
    return (
      <Screen back title="Your campaign">
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={color.grey4} />
        </View>
      </Screen>
    );
  }

  return (
    <ListingEditor
      // The first save creates the listing and its starting agreement; remount to show it.
      key={listing?.id ?? 'new'}
      listing={listing}
      companyName={activeCompany?.name ?? 'Your'}
      onBack={() => router.back()}
      onSave={async (patch) => {
        const created = listing === null;
        const saved = await saveListing(listing?.id ?? null, patch);
        setListing(saved);
        if (created) {
          toast.show('Saved. Read the agreement, then open it to creators.');
          return;
        }
        toast.success(saved.status === 'open' ? 'Saved. Your campaign is open.' : 'Saved');
        router.back();
      }}
    />
  );
}
