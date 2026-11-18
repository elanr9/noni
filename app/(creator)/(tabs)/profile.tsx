import { useEffect } from 'react';
import { useRouter } from 'expo-router';

import { CreatorScreen } from '../../../components/admin/v2/creator/CreatorScreen';
import { useAuth } from '../../../lib/auth';
import { postTapHref } from '../../../lib/creator-resume';
import { useV2Data } from '../../../lib/v2-posts';

/** Profile tab: the shared creator screen for me, with the settings disc. */
export default function CreatorProfile() {
  const { profile } = useAuth();
  const router = useRouter();
  const companyId = profile?.active_company_id;
  const load = useV2Data((s) => s.load);

  useEffect(() => {
    if (companyId) void load(companyId);
  }, [companyId, load]);

  if (!profile) return null;
  return (
    <CreatorScreen
      id={profile.id}
      tabRoot
      onSettings={() => router.push('/(creator)/settings')}
      onPost={(p) => {
        const href = postTapHref(p);
        if (href) router.push(href);
      }}
    />
  );
}
