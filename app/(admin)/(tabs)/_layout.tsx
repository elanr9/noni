import { Tabs } from 'expo-router';

import { TabBar } from '../../../components/ui/TabBar';
import type { IconName } from '../../../components/ui/Icon';
import { MOCK_QUEUE } from '../../../lib/admin-mock';
import { color } from '../../../theme/tokens';

const ADMIN_ITEMS: Record<string, { icon: IconName; label: string }> = {
  index: { icon: 'inbox', label: 'Queue' },
  calendar: { icon: 'calendar-days', label: 'Calendar' },
  trends: { icon: 'trending-up', label: 'Trends' },
  analytics: { icon: 'chart-column', label: 'Analytics' },
  settings: { icon: 'settings', label: 'Settings' },
};

export default function AdminTabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} items={ADMIN_ITEMS} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: color.offWhite },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Queue', tabBarBadge: MOCK_QUEUE.length }}
      />
      <Tabs.Screen name="calendar" options={{ title: 'Calendar' }} />
      <Tabs.Screen name="trends" options={{ title: 'Trends' }} />
      <Tabs.Screen name="analytics" options={{ title: 'Analytics' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}
