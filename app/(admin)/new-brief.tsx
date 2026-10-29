import { useLocalSearchParams } from 'expo-router';

import { NewBriefScreen } from '../../components/admin/v2/newbrief/NewBriefScreen';
import { useAuth } from '../../lib/auth';

/** Create a post from the Create button, or open a saved brief when `slot` is an existing id. */
export default function NewBriefRoute() {
  const { slot } = useLocalSearchParams<{ slot?: string }>();
  const { session, profile } = useAuth();
  return (
    <NewBriefScreen
      slot={slot || 'new'}
      briefsHref="/(admin)/(tabs)/briefs"
      postHref="/(admin)/brief-post"
      userId={session?.user.id ?? null}
      companyId={profile?.active_company_id ?? ''}
    />
  );
}
