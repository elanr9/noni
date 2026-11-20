import { useCallback } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { View } from 'react-native';

import { BriefList } from '../../../components/admin/v2/briefs/BriefList';
import { UploadBriefButton } from '../../../components/admin/v2/importbrief/UploadBriefButton';
import { ContextRow } from '../../../components/shared/ContextRow';
import { useAuth } from '../../../lib/auth';
import { useLibStore } from '../../../lib/brief-library-api';
import { postsForBrief, useV2Data } from '../../../lib/v2-posts';
import { color } from '../../../theme/v2';

/** Briefs tab root: the library of guided templates and outlines. Reloads whenever the tab comes into view. */
export default function BriefsScreen() {
  const { profile } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const companyId = profile?.active_company_id;
  const load = useLibStore((s) => s.load);
  const loaded = useLibStore((s) => s.loaded && s.companyId === companyId);
  const loadData = useV2Data((s) => s.load);
  const posts = useV2Data((s) => s.posts);

  useFocusEffect(
    useCallback(() => {
      if (!companyId) return;
      void load(companyId);
      void loadData(companyId);
    }, [companyId, load, loadData]),
  );

  return (
    <View style={{ flex: 1, backgroundColor: color.bg, paddingTop: insets.top }}>
      <ContextRow
        style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 }}
        right={
          <UploadBriefButton onPress={() => router.push('/(admin)/import-brief')} />
        }
      />
      <BriefList
        loading={!loaded}
        empty="No posts yet. Tap + to make your first one and your creators will see it in their Briefs."
        uses={(b) => postsForBrief(posts, b).length}
        onOpen={(b) => router.push({ pathname: '/(admin)/new-brief', params: { slot: b.id } })}
      />
    </View>
  );
}
