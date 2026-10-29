import { Tabs, useRouter } from 'expo-router';

import { TabBar, type TabBarEntry } from '../../../components/v2';
import { color, screenTransition } from '../../../theme/v2';

const ENTRIES: TabBarEntry[] = [
  { kind: 'route', name: 'review', icon: 'inbox', label: 'Review' },
  { kind: 'route', name: 'briefs', icon: 'list_alt', label: 'Briefs' },
  { kind: 'create', label: 'Create' },
  { kind: 'route', name: 'messages', icon: 'chat_bubble', label: 'Messages' },
  { kind: 'route', name: 'analytics', icon: 'bar_chart', label: 'Analytics' },
];

export default function DevTabsLayout() {
  const router = useRouter();
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} entries={ENTRIES} counts={{ review: 8, messages: 5 }} onCreate={() => router.push({ pathname: '/dev-preview/new-brief', params: { slot: 'new' } })} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: color.bg }, animation: screenTransition.tab }}
    >
      <Tabs.Screen name="review" options={{ title: 'Review' }} />
      <Tabs.Screen name="briefs" options={{ title: 'Briefs' }} />
      <Tabs.Screen name="messages" options={{ title: 'Messages' }} />
      <Tabs.Screen name="analytics" options={{ title: 'Analytics' }} />
    </Tabs>
  );
}
