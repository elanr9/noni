import { useLocalSearchParams, useRouter } from 'expo-router';

import { CreatorScreen } from '../../../components/admin/v2/creator/CreatorScreen';

export default function CreatorPreview() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  return <CreatorScreen id={id ?? ''} onMessage={() => undefined} onPost={(p) => router.push({ pathname: '/dev-preview/brief-post/[id]', params: { id: p.id } })} />;
}
