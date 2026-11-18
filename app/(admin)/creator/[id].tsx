import { useLocalSearchParams, useRouter } from 'expo-router';

import { CreatorScreen } from '../../../components/admin/v2/creator/CreatorScreen';
import { useV2Refresh } from '../../../components/admin/v2/posts/useV2Refresh';
import { useAuth } from '../../../lib/auth';

/** Creator profile: figures, the posts list or calendar, Message. */
export default function AdminCreatorProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useAuth();
  const router = useRouter();
  const { refreshing, onRefresh, retry } = useV2Refresh(profile?.active_company_id);

  return (
    <CreatorScreen
      id={id ?? ''}
      refreshing={refreshing}
      onRefresh={onRefresh}
      onRetry={retry}
      onMessage={() => router.push({ pathname: '/(admin)/chat/[creatorId]', params: { creatorId: id ?? '' } })}
      onPost={(p) => {
        if ((p.state === 'Waiting' || p.state === 'Changes requested') && p.assignmentId) {
          router.push({ pathname: '/(admin)/review/[id]', params: { id: p.assignmentId } });
        } else {
          router.push({ pathname: '/(admin)/brief-post/[id]', params: { id: p.id } });
        }
      }}
    />
  );
}
