import { useCallback, useState } from 'react';
import { Tabs, useFocusEffect } from 'expo-router';

import { TabBar } from '../../../components/ui/TabBar';
import type { IconName } from '../../../components/ui/Icon';
import { listAssignmentQueue } from '../../../lib/admin-api';
import { color } from '../../../theme/tokens';

// Trends is cut per MVP v2; Settings hides here and opens from the gear on
// Analytics; Calendar hides here and lives in Briefs as a view toggle. All
// three routes stay in the folder so they remain navigable.
const ADMIN_ITEMS: Record<string, { icon: IconName; label: string }> = {
  index: { icon: 'inbox', label: 'Review' },
  create: { icon: 'plus', label: 'Briefs' },
  library: { icon: 'layout-list', label: 'Library' },
  creators: { icon: 'users', label: 'Creators' },
  analytics: { icon: 'chart-column', label: 'Analytics' },
};

export default function AdminTabsLayout() {
  const [queueCount, setQueueCount] = useState(0);

  useFocusEffect(
    useCallback(() => {
      void listAssignmentQueue()
        .then((q) => setQueueCount(q.length))
        .catch(() => setQueueCount(0));
    }, []),
  );

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
        options={{
          title: 'Review',
          tabBarBadge: queueCount > 0 ? queueCount : undefined,
        }}
      />
      <Tabs.Screen name="create" options={{ title: 'Briefs' }} />
      <Tabs.Screen name="calendar" options={{ title: 'Calendar', href: null }} />
      <Tabs.Screen name="library" options={{ title: 'Library' }} />
      <Tabs.Screen name="creators" options={{ title: 'Creators' }} />
      <Tabs.Screen name="analytics" options={{ title: 'Analytics' }} />
      <Tabs.Screen name="trends" options={{ title: 'Trends', href: null }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', href: null }} />
    </Tabs>
  );
}
