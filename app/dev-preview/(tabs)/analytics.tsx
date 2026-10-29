import { useRouter } from 'expo-router';

import { AnalyticsScreen } from '../../../components/admin/v2/analytics/AnalyticsScreen';

export default function AnalyticsPreview() {
  const router = useRouter();
  return (
    <AnalyticsScreen
      onCreator={(id) => router.push({ pathname: '/dev-preview/creator/[id]', params: { id } })}
      onPost={(id) => router.push({ pathname: '/dev-preview/brief-post/[id]', params: { id } })}
    />
  );
}
