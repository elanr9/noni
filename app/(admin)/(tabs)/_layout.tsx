import { useCallback, useState } from 'react';
import { Tabs, useFocusEffect } from 'expo-router';

import { TabBar } from '../../../components/ui/TabBar';
import type { IconName } from '../../../components/ui/Icon';
import { listAssignmentQueue } from '../../../lib/admin-api';
import { useAuth } from '../../../lib/auth';
import { isManagerSetupCompleteFlag } from '../../../lib/profile';
import { color } from '../../../theme/tokens';

// Trends is cut per MVP v2; Settings hides here and opens from the gear on
// Analytics; the Briefs tab is the calendar route (week list + calendar view
// toggle per the design handoff). Hidden routes stay in the folder so they
// remain navigable.
const ADMIN_ITEMS: Record<string, { icon: IconName; label: string }> = {
  index: { icon: 'inbox', label: 'Review' },
  calendar: { icon: 'plus', label: 'Briefs' },
  library: { icon: 'layout-list', label: 'Library' },
  creators: { icon: 'users', label: 'Creators' },
  analytics: { icon: 'chart-column', label: 'Analytics' },
};

// Fresh campaign managers get a temporary Setup tab that retires when their
// checklist is done. The platform admin never sees it.
const SETUP_ITEMS: Record<string, { icon: IconName; label: string }> = {
  setup: { icon: 'sparkles', label: 'Setup' },
  ...ADMIN_ITEMS,
};

export default function AdminTabsLayout() {
  const { profile } = useAuth();
  const [queueCount, setQueueCount] = useState(0);

  const showSetup =
    profile?.role === 'campaign_manager' &&
    !isManagerSetupCompleteFlag(profile.onboarding_answers);

  useFocusEffect(
    useCallback(() => {
      void listAssignmentQueue()
        .then((q) => setQueueCount(q.length))
        .catch(() => setQueueCount(0));
    }, []),
  );

  return (
    <Tabs
      tabBar={(props) => (
        <TabBar {...props} items={showSetup ? SETUP_ITEMS : ADMIN_ITEMS} />
      )}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: color.offWhite },
      }}
    >
      <Tabs.Screen
        name="setup"
        options={{ title: 'Setup', href: showSetup ? undefined : null }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: 'Review',
          tabBarBadge: queueCount > 0 ? queueCount : undefined,
        }}
      />
      <Tabs.Screen name="calendar" options={{ title: 'Briefs' }} />
      <Tabs.Screen name="create" options={{ title: 'Create', href: null }} />
      <Tabs.Screen name="library" options={{ title: 'Library' }} />
      <Tabs.Screen name="creators" options={{ title: 'Creators' }} />
      <Tabs.Screen name="analytics" options={{ title: 'Analytics' }} />
      <Tabs.Screen name="trends" options={{ title: 'Trends', href: null }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', href: null }} />
    </Tabs>
  );
}
