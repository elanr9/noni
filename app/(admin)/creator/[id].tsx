import { useEffect } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { CreatorScreen } from '../../../components/admin/v2/creator/CreatorScreen';
import { useAuth } from '../../../lib/auth';
import { useV2Data } from '../../../lib/v2-posts';

/** Creator profile: figures, the posts list or calendar, Message. */
export default function AdminCreatorProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useAuth();
  const router = useRouter();
  const companyId = profile?.active_company_id;
  const load = useV2Data((s) => s.load);

  useEffect(() => {
    if (!companyId) return;
    void load(companyId);
  }, [companyId, load]);

  return (
    <CreatorScreen
      id={id ?? ''}
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
