import { useLocalSearchParams, useRouter } from 'expo-router';

import { BriefPostScreen } from '../../../components/admin/v2/posts/BriefPostScreen';

/** A post made from a brief. */
export default function BriefPostRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  return <BriefPostScreen id={id ?? ''} onCreator={(creatorId) => router.push({ pathname: '/(admin)/creator/[id]', params: { id: creatorId } })} />;
}
