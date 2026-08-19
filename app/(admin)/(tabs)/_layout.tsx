import { useCallback, useState } from 'react';
import { Tabs, useFocusEffect } from 'expo-router';

import { TabBar } from '../../../components/ui/TabBar';
import type { IconName } from '../../../components/ui/Icon';
import { listAssignmentQueue, listMusicApprovalQueue } from '../../../lib/admin-api';
import { listAccountApprovalQueue } from '../../../lib/creator-accounts-api';
import { useAuth } from '../../../lib/auth';
import { isManagerSetupCompleteFlag } from '../../../lib/profile';
import { color, screenTransition } from '../../../theme/tokens';

// Trends is cut per MVP v2; Settings hides here and opens from the gear on
// Analytics; the Briefs tab is the calendar route (week list + calendar view
// toggle per the design handoff). Hidden routes stay in the folder so they
// remain navigable.
const QUEUE_POLL_MS = 45_000;

const ADMIN_ITEMS: Record<string, { icon: IconName; label: string }> = {
  index: { icon: 'inbox', label: 'Review' },
  calendar: { icon: 'plus', label: 'Briefs' },
  library: { icon: 'layout-list', label: 'Library' },
  creators: { icon: 'users', label: 'Creators' },
  analytics: { icon: 'chart-column', label: 'Analytics' },
};

// Fresh campaign managers get Onboarding on the left in place of Creators.
// The tab retires once the checklist is done. The platform admin never sees it.
const ONBOARDING_ITEMS: Record<string, { icon: IconName; label: string }> = {
  setup: { icon: 'sparkles', label: 'Onboarding' },
  index: { icon: 'inbox', label: 'Review' },
  calendar: { icon: 'plus', label: 'Briefs' },
  library: { icon: 'layout-list', label: 'Library' },
  analytics: { icon: 'chart-column', label: 'Analytics' },
};

export default function AdminTabsLayout() {
  const { profile } = useAuth();
  const [queueCount, setQueueCount] = useState(0);

  const showSetup =
    profile?.role === 'campaign_manager' &&
    !isManagerSetupCompleteFlag(profile.onboarding_answers);

  const companyId = profile?.company_id;

  // Mirrors the total the Review screen shows. Polled because the tabs layout
  // does not refocus when a manager moves between tabs, and an account waiting
  // for review is the only in-app signal that a creator has applied.
  useFocusEffect(
    useCallback(() => {
      if (companyId === undefined) return;
      const read = () => {
        void Promise.all([
          listAssignmentQueue(),
          listMusicApprovalQueue(companyId),
          listAccountApprovalQueue(companyId),
        ])
          .then(([assignments, music, accounts]) =>
            setQueueCount(
              assignments.length +
                music.length +
                accounts.filter((a) => a.status !== 'needs_changes').length,
            ),
          )
          .catch(() => undefined);
      };
      read();
      const timer = setInterval(read, QUEUE_POLL_MS);
      return () => clearInterval(timer);
    }, [companyId]),
  );

  return (
    <Tabs
      tabBar={(props) => (
        <TabBar {...props} items={showSetup ? ONBOARDING_ITEMS : ADMIN_ITEMS} />
      )}
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
      <Tabs.Screen
        name="creators"
        options={{ title: 'Creators', href: showSetup ? null : undefined }}
      />
      <Tabs.Screen name="analytics" options={{ title: 'Analytics' }} />
      <Tabs.Screen name="trends" options={{ title: 'Trends', href: null }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', href: null }} />
    </Tabs>
  );
}
