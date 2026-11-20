import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BriefList } from '../../../components/admin/v2/briefs/BriefList';
import { UploadBriefButton } from '../../../components/admin/v2/importbrief/UploadBriefButton';
import { postsForBrief, useV2Data } from '../../../lib/v2-posts';
import { color } from '../../../theme/v2';

export default function BriefsPreview() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const posts = useV2Data((s) => s.posts);
  return (
    <View style={{ flex: 1, backgroundColor: color.bg, paddingTop: insets.top + 12 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 20, paddingBottom: 12 }}>
        <UploadBriefButton onPress={() => router.push('/dev-preview/import-brief')} />
      </View>
      <BriefList uses={(b) => postsForBrief(posts, b).length} onOpen={(b) => router.push({ pathname: '/dev-preview/new-brief', params: { slot: b.id } })} />
    </View>
  );
}
