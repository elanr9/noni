import { useCallback, useState } from 'react';
import { Tabs, useFocusEffect } from 'expo-router';

import { TabBar, type TabBarItem } from '../../../components/ui/TabBar';
import { useAuth } from '../../../lib/auth';
import { useCompany } from '../../../lib/company-context';
import { unreadInboxCount } from '../../../lib/inbox-api';
import { isManagerSetupCompleteFlag } from '../../../lib/profile';
import { color, screenTransition } from '../../../theme/tokens';

// Trends is cut per MVP v2; Settings hides here and opens from the gear on
// Analytics; the Briefs tab is the calendar route (week list + calendar view
// toggle per the design handoff). Hidden routes stay in the folder so they
// remain navigable.
const UNREAD_POLL_MS = 45_000;

const ADMIN_ITEMS: Record<string, TabBarItem> = {
  index: { icon: 'inbox', label: 'Review' },
  calendar: { icon: 'layout-list', label: 'Briefs' },
  library: { icon: 'images', label: 'Library' },
  messages: { icon: 'message-circle', label: 'Messages' },
  analytics: { icon: 'chart-column', label: 'Analytics' },
};

// Fresh campaign managers get Onboarding on the left in place of Messages.
// The tab retires once the checklist is done. The platform admin never sees it.
const ONBOARDING_ITEMS: Record<string, TabBarItem> = {
  setup: { icon: 'sparkles', label: 'Onboarding' },
  index: { icon: 'inbox', label: 'Review' },
  calendar: { icon: 'layout-list', label: 'Briefs' },
  library: { icon: 'images', label: 'Library' },
  analytics: { icon: 'chart-column', label: 'Analytics' },
};

export default function AdminTabsLayout() {
  const { profile } = useAuth();
  const { anyWaiting } = useCompany();
  const [unreadCount, setUnreadCount] = useState(0);

  const showSetup =
    profile?.role === 'campaign_manager' &&
    !isManagerSetupCompleteFlag(profile.onboarding_answers);

  const companyId = profile?.active_company_id;

  useFocusEffect(
    useCallback(() => {
      if (companyId === undefined) return;
      const read = () => {
        void unreadInboxCount()
          .then(setUnreadCount)
          .catch(() => undefined);
      };
      read();
      const timer = setInterval(read, UNREAD_POLL_MS);
      return () => clearInterval(timer);
    }, [companyId]),
  );

  const base = showSetup ? ONBOARDING_ITEMS : ADMIN_ITEMS;
  const items: Record<string, TabBarItem> = {
    ...base,
    index: { ...base.index, dot: anyWaiting },
  };

  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} items={items} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: color.offWhite },
        animation: screenTransition.tab,
      }}
    >
      <Tabs.Screen
        name="setup"
        options={{ title: 'Onboarding', href: showSetup ? undefined : null }}
      />
      <Tabs.Screen name="index" options={{ title: 'Review' }} />
      <Tabs.Screen name="calendar" options={{ title: 'Briefs' }} />
      <Tabs.Screen name="create" options={{ title: 'Create', href: null }} />
      <Tabs.Screen name="library" options={{ title: 'Library' }} />
      <Tabs.Screen
        name="messages"
        options={{
          title: 'Messages',
          href: showSetup ? null : undefined,
          tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
        }}
      />
      <Tabs.Screen name="analytics" options={{ title: 'Analytics' }} />
      <Tabs.Screen name="trends" options={{ title: 'Trends', href: null }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', href: null }} />
    </Tabs>
  );
}
