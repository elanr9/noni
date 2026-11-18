import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BriefList } from '../../../components/admin/v2/briefs/BriefList';
import { postsForBrief, useV2Data } from '../../../lib/v2-posts';
import { color } from '../../../theme/v2';

export default function BriefsPreview() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const posts = useV2Data((s) => s.posts);
  return (
    <View style={{ flex: 1, backgroundColor: color.bg, paddingTop: insets.top + 12 }}>
      <BriefList uses={(b) => postsForBrief(posts, b).length} onOpen={(b) => router.push({ pathname: '/dev-preview/new-brief', params: { slot: b.id } })} />
    </View>
  );
}
