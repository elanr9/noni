import { useLocalSearchParams, useRouter } from 'expo-router';

import { BriefPostScreen } from '../../../components/admin/v2/posts/BriefPostScreen';
import { useV2Refresh } from '../../../components/admin/v2/posts/useV2Refresh';
import { useAuth } from '../../../lib/auth';

/** A post made from a brief. Loads the company's posts itself, so a cold open from a link or push works. */
export default function BriefPostRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { profile } = useAuth();
  const { refreshing, onRefresh, retry } = useV2Refresh(profile?.active_company_id);
  return (
    <BriefPostScreen
      id={id ?? ''}
      refreshing={refreshing}
      onRefresh={onRefresh}
      onRetry={retry}
      onCreator={(creatorId) => router.push({ pathname: '/(admin)/creator/[id]', params: { id: creatorId } })}
    />
  );
}
