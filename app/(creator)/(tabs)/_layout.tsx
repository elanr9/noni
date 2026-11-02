import { useCallback, useState } from 'react';
import { Tabs, useFocusEffect, useRouter } from 'expo-router';

import { TabBar, type TabBarEntry } from '../../../components/v2';
import { useAuth } from '../../../lib/auth';
import { unreadCreatorDmCount } from '../../../lib/creator-inbox-api';
import { color, screenTransition } from '../../../theme/v2';

// v2 creator shell: Home, Earnings, the raised Create button, Messages, Profile.
// Create opens the sheet over whatever tab is showing.
const POLL_MS = 20_000;

const ENTRIES: TabBarEntry[] = [
  { kind: 'route', name: 'index', icon: 'home', label: 'Home' },
  { kind: 'route', name: 'earnings', icon: 'payments', label: 'Earnings' },
  { kind: 'create', label: 'Create' },
  { kind: 'route', name: 'messages', icon: 'chat_bubble', label: 'Messages' },
  { kind: 'route', name: 'profile', icon: 'person', label: 'Profile' },
];

export default function CreatorTabsLayout() {
  const { profile } = useAuth();
  const router = useRouter();
  const companyId = profile?.active_company_id;
  const meId = profile?.id;
  const [unread, setUnread] = useState(0);

  useFocusEffect(
    useCallback(() => {
      if (companyId === undefined || meId === undefined) return;
      const read = () => {
        void unreadCreatorDmCount(companyId, meId).then(setUnread).catch(() => undefined);
      };
      read();
      const timer = setInterval(read, POLL_MS);
      return () => clearInterval(timer);
    }, [companyId, meId]),
  );

  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} entries={ENTRIES} onCreate={() => router.push('/(creator)/create')} counts={{ messages: unread || undefined }} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: color.bg },
        animation: screenTransition.tab,
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="earnings" options={{ title: 'Earnings' }} />
      <Tabs.Screen name="messages" options={{ title: 'Messages' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
