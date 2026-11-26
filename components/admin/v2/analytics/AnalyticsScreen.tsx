// Analytics tab shell (ANALYTICS.md 1): no page title. The company pill and a
// settings disc, the Analytics | Creators | Posts underline tabs, then the
// tab's pane. 450ms skeleton on first load.
import { useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useV2Data } from '../../../../lib/v2-posts';
import { color, shadow } from '../../../../theme/v2';
import { ContextRow } from '../../../shared/ContextRow';
import { Icon, Press, Skeleton, TabPane, UnderlineTabs, useTabBarInset } from '../../../v2';
import { LoadError } from '../posts/LoadError';
import { useV2Failed } from '../posts/useV2Refresh';
import { useSalesView } from '../useSalesView';
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
  /** Pushes the Creators list (roster, invite). */
  onCreators?: () => void;
  onCreator: (id: string) => void;
  onPost: (id: string) => void;
  /** Pull to refresh on every pane. */
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Try again after a failed load. */
  onRetry?: () => void;
}

export function AnalyticsScreen({ onSettings, onCreators, onCreator, onPost, refreshing = false, onRefresh, onRetry }: AnalyticsScreenProps) {
  const insets = useSafeAreaInsets();
  const bottomInset = useTabBarInset();
  const [tab, setTab] = useState<Tab>('analytics');
  const [ready, setReady] = useState(false);
  const posts = useV2Data((s) => s.posts);
  const creators = useV2Data((s) => s.creators);
  const days = useV2Data((s) => s.days);
  const view = useSalesView();
  const loaded = useV2Data((s) => s.loaded);
  // A retry after a failure has nothing to show yet: skeleton, never zeros.
  const empty = useV2Data((s) => s.loading && s.posts.length === 0 && s.creators.length === 0);
  const live = useMemo(() => scopedPosts(posts), [posts]);
  const failed = useV2Failed();
  const refresh = onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={color.grey4} colors={[color.blue]} /> : undefined;

  useEffect(() => {
    const t = setTimeout(() => setReady(true), SKELETON_MS);
    return () => clearTimeout(t);
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: color.bg, paddingTop: insets.top }}>
      <View style={{ paddingHorizontal: 20 }}>
        <ContextRow
          style={{ paddingTop: 8, paddingBottom: 8 }}
          right={
            onSettings ? (
              <Press accessibilityRole="button" accessibilityLabel="Settings" onPress={onSettings} style={{ width: 40, height: 40, borderRadius: 999, backgroundColor: color.card, alignItems: 'center', justifyContent: 'center', ...shadow.card }}>
                <Icon name="settings" size={20} color={color.ink} />
              </Press>
            ) : undefined
          }
        />
        <UnderlineTabs items={TABS} value={tab} onChange={setTab} size={17} style={{ marginBottom: 14 }} />
      </View>
      {failed ? (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: bottomInset + 24 }} refreshControl={refresh}>
          <LoadError onRetry={onRetry ?? onRefresh ?? (() => undefined)} what="analytics" />
        </ScrollView>
      ) : !ready || !loaded || empty ? (
        <View style={{ paddingHorizontal: 20, gap: 12 }}>
          <Skeleton h={44} />
          <Skeleton h={150} />
          <Skeleton h={220} />
        </View>
      ) : tab === 'analytics' ? (
        <TabPane k="a">
          <AnalyticsPane posts={live} days={days} onPost={onPost} onSeeAll={() => setTab('posts')} view={view} bottomInset={bottomInset} refreshControl={refresh} />
        </TabPane>
      ) : tab === 'creators' ? (
        <TabPane k="c">
          <CreatorsPane creators={creators} onCreator={onCreator} onManage={onCreators} view={view} bottomInset={bottomInset} refreshControl={refresh} />
        </TabPane>
      ) : (
        <TabPane k="p">
          <PostsPane posts={live} creators={creators} onPost={onPost} bottomInset={bottomInset} refreshControl={refresh} />
        </TabPane>
      )}
    </View>
  );
}
