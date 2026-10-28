import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { View } from 'react-native';

import { BriefList } from '../../../components/admin/v2/briefs/BriefList';
import { useAuth } from '../../../lib/auth';
import { useLibStore } from '../../../lib/brief-library-api';
import { postsForBrief, useV2Data } from '../../../lib/v2-posts';
import { color } from '../../../theme/v2';

/** Briefs tab root: the library of guided templates and outlines. */
export default function BriefsScreen() {
  const { profile } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const companyId = profile?.active_company_id;
  const load = useLibStore((s) => s.load);
  const loadData = useV2Data((s) => s.load);
  const posts = useV2Data((s) => s.posts);

  useEffect(() => {
    if (!companyId) return;
    void load(companyId);
    void loadData(companyId);
  }, [companyId, load, loadData]);

  return (
    <View style={{ flex: 1, backgroundColor: color.bg, paddingTop: insets.top }}>
      <BriefList
        title="Briefs"
        uses={(b) => postsForBrief(posts, b).length}
        onOpen={(b) => router.push({ pathname: '/(admin)/new-brief', params: { slot: b.id } })}
      />
    </View>
  );
}
