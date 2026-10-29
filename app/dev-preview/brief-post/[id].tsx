import { useLocalSearchParams } from 'expo-router';

import { BriefPostScreen } from '../../../components/admin/v2/posts/BriefPostScreen';

export default function BriefPostPreview() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <BriefPostScreen id={id ?? ''} />;
}
