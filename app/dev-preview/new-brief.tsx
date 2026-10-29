import { useLocalSearchParams } from 'expo-router';

import { NewBriefScreen } from '../../components/admin/v2/newbrief/NewBriefScreen';

export default function NewBriefPreview() {
  const { slot } = useLocalSearchParams<{ slot?: string }>();
  return <NewBriefScreen slot={slot || 'new'} briefsHref="/dev-preview/(tabs)/briefs" postHref="/dev-preview/brief-post" />;
}
