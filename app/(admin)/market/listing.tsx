import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useRouter } from 'expo-router';

import { ListingEditor } from '../../../components/marketplace/ListingEditor';
import { Empty, Screen } from '../../../components/v2';
import { toast } from '../../../components/v2/Toast';
import { useAuth } from '../../../lib/auth';
import type { Listing } from '../../../lib/marketplace';
import { loadOrMakeListing, saveListing } from '../../../lib/marketplace-api';
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
    // A company with no campaign gets one written from what it told Noni.
    void loadOrMakeListing(companyId)
      .then((row) => {
        if (!off) setListing(row);
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

  if (listing === null) {
    return (
      <Screen back title="Your campaign">
        <View style={{ padding: 20 }}>
          <Empty>Could not load your campaign.</Empty>
        </View>
      </Screen>
    );
  }

  return (
    <ListingEditor
      key={listing.id}
      listing={listing}
      companyName={activeCompany?.name ?? listing.title}
      logoPath={activeCompany?.logoPath ?? null}
      onBack={() => router.back()}
      onSave={async (patch) => {
        const saved = await saveListing(listing.id, patch);
        setListing(saved);
        toast.success(saved.status === 'open' ? 'Campaign is open' : 'Saved');
        router.back();
      }}
    />
  );
}
