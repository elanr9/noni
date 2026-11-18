import { useRouter } from 'expo-router';

import { AnalyticsScreen } from '../../../components/admin/v2/analytics/AnalyticsScreen';
import { useV2Refresh } from '../../../components/admin/v2/posts/useV2Refresh';
import { useAuth } from '../../../lib/auth';

/** Analytics tab root: views and posts by period, creators, every live post. Refetches on focus and on pull. */
export default function AnalyticsTab() {
  const { profile } = useAuth();
  const router = useRouter();
  const { refreshing, onRefresh, retry } = useV2Refresh(profile?.active_company_id);

  return (
    <AnalyticsScreen
      refreshing={refreshing}
      onRefresh={onRefresh}
      onRetry={retry}
      onSettings={() => router.push('/(admin)/settings')}
      onCreators={() => router.push('/(admin)/creators')}
      onCreator={(id) => router.push({ pathname: '/(admin)/creator/[id]', params: { id } })}
      onPost={(id) => router.push({ pathname: '/(admin)/brief-post/[id]', params: { id } })}
    />
  );
}
