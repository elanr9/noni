import { useLocalSearchParams } from 'expo-router';

import { BriefPostScreen } from '../../../components/admin/v2/posts/BriefPostScreen';

/** A post made from a library brief. */
export default function BriefPostRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <BriefPostScreen id={id ?? ''} />;
}
