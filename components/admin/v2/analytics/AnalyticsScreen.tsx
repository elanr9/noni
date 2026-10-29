// Analytics tab shell (ANALYTICS.md 1): no page title, a pinned row with the
// Analytics | Creators | Posts underline tabs and a settings disc, a divider,
// then the tab's pane. 450ms skeleton on first load.
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useV2Data } from '../../../../lib/v2-posts';
import { color } from '../../../../theme/v2';
import { Icon, Press, Skeleton, TabPane, UnderlineTabs, useTabBarInset } from '../../../v2';
import { AnalyticsPane } from './AnalyticsPane';
import { CreatorsPane } from './CreatorsPane';
import { scopedPosts } from './periods';
import { PostsPane } from './PostsPane';

type Tab = 'analytics' | 'creators' | 'posts';
const TABS: readonly { key: Tab; label: string }[] = [
  { key: 'analytics', label: 'Analytics' },
  { key: 'creators', label: 'Creators' },
  { key: 'posts', label: 'Posts' },
];
const SKELETON_MS = 450;

export interface AnalyticsScreenProps {
  onSettings?: () => void;
  onCreator: (id: string) => void;
  onPost: (id: string) => void;
}

export function AnalyticsScreen({ onSettings, onCreator, onPost }: AnalyticsScreenProps) {
  const insets = useSafeAreaInsets();
  const bottomInset = useTabBarInset();
  const [tab, setTab] = useState<Tab>('analytics');
  const [ready, setReady] = useState(false);
  const posts = useV2Data((s) => s.posts);
  const creators = useV2Data((s) => s.creators);
  const days = useV2Data((s) => s.days);
  const loaded = useV2Data((s) => s.loaded);
  const live = useMemo(() => scopedPosts(posts), [posts]);

  useEffect(() => {
    const t = setTimeout(() => setReady(true), SKELETON_MS);
    return () => clearTimeout(t);
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: color.bg, paddingTop: insets.top }}>
      <View style={{ paddingHorizontal: 20 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 2 }}>
          <UnderlineTabs items={TABS} value={tab} onChange={setTab} size={18} hairline={false} style={{ flex: 1 }} />
          {onSettings ? (
            <Press accessibilityRole="button" accessibilityLabel="Settings" onPress={onSettings} style={{ width: 36, height: 36, borderRadius: 999, backgroundColor: color.grey2, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="settings" size={20} color={color.ink} />
            </Press>
          ) : null}
        </View>
        <View style={{ height: 1, backgroundColor: color.grey2, marginBottom: 16 }} />
      </View>
      {!ready || !loaded ? (
        <View style={{ paddingHorizontal: 20, gap: 12 }}>
          <Skeleton h={44} />
          <Skeleton h={150} />
          <Skeleton h={220} />
        </View>
      ) : tab === 'analytics' ? (
        <TabPane k="a">
          <AnalyticsPane posts={live} days={days} onPost={onPost} onSeeAll={() => setTab('posts')} bottomInset={bottomInset} />
        </TabPane>
      ) : tab === 'creators' ? (
        <TabPane k="c">
          <CreatorsPane creators={creators} onCreator={onCreator} bottomInset={bottomInset} />
        </TabPane>
      ) : (
        <TabPane k="p">
          <PostsPane posts={live} creators={creators} onPost={onPost} bottomInset={bottomInset} />
        </TabPane>
      )}
    </View>
  );
}
