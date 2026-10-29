import { useLocalSearchParams, useRouter } from 'expo-router';

import { BriefPostScreen } from '../../../components/admin/v2/posts/BriefPostScreen';

export default function BriefPostPreview() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  return <BriefPostScreen id={id ?? ''} onCreator={(creatorId) => router.push({ pathname: '/dev-preview/creator/[id]', params: { id: creatorId } })} />;
}
