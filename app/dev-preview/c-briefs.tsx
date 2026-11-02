import { useRouter } from 'expo-router';

import { BriefList } from '../../components/admin/v2/briefs/BriefList';
import { Screen } from '../../components/v2';

export default function Preview() {
  const router = useRouter();
  return (
    <Screen>
      <BriefList back title="Briefs" empty="Nothing here yet." onOpen={() => router.push('/dev-preview/c-outline')} />
    </Screen>
  );
}
