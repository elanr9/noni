import { useEffect } from 'react';
import { useRouter } from 'expo-router';

import { AnalyticsScreen } from '../../../components/admin/v2/analytics/AnalyticsScreen';
import { useAuth } from '../../../lib/auth';
import { useV2Data } from '../../../lib/v2-posts';

/** Analytics tab root: views and posts by period, creators, every live post. */
export default function AnalyticsTab() {
  const { profile } = useAuth();
  const router = useRouter();
  const companyId = profile?.active_company_id;
  const load = useV2Data((s) => s.load);

  useEffect(() => {
    if (!companyId) return;
    void load(companyId);
  }, [companyId, load]);

  return (
    <AnalyticsScreen
      onSettings={() => router.push('/(admin)/(tabs)/settings')}
      onCreator={(id) => router.push({ pathname: '/(admin)/creator/[id]', params: { id } })}
      onPost={(id) => router.push({ pathname: '/(admin)/brief-post/[id]', params: { id } })}
    />
  );
}
