import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';

import { AnalyticsScreen } from '../../../components/admin/v2/analytics/AnalyticsScreen';
import { useV2Data } from '../../../lib/v2-posts';

/** Dev only. ?stripe=0|1 &app=0|1 set what the company connected; ?fin=0|1 &su=0|1 set the manager access toggles. */
export default function AnalyticsPreview() {
  const router = useRouter();
  const q = useLocalSearchParams<{ stripe?: string; app?: string; fin?: string; su?: string }>();
  useEffect(() => {
    const stripe = q.stripe !== '0';
    useV2Data.setState({
      salesConnected: stripe,
      stripeConnected: stripe || q.app === '1',
      previewAccess: { viewFinancials: q.fin !== '0', viewSignups: q.su !== '0' },
    });
  }, [q.stripe, q.app, q.fin, q.su]);
  return (
    <AnalyticsScreen
      onCreator={(id) => router.push({ pathname: '/dev-preview/creator/[id]', params: { id } })}
      onPost={(id) => router.push({ pathname: '/dev-preview/brief-post/[id]', params: { id } })}
    />
  );
}
