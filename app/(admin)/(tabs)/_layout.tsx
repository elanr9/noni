import { useCallback, useState } from 'react';
import { Tabs, useFocusEffect, useRouter } from 'expo-router';

import { TabBar, type TabBarEntry } from '../../../components/v2';
import { countAssignmentsInFlight } from '../../../lib/admin-api';
import { useAuth } from '../../../lib/auth';
import { unreadInboxCount } from '../../../lib/inbox-api';
import { isManagerSetupCompleteFlag } from '../../../lib/profile';
import { color, screenTransition } from '../../../theme/v2';

// v2 shell: Review, Briefs, the raised Create button, Messages, Analytics.
// Fresh campaign managers get Onboarding in place of Messages until the
// checklist is done. Settings stays in the folder, hidden from the bar, so
// its deep link keeps working.
const POLL_MS = 45_000;

const ADMIN_ENTRIES: TabBarEntry[] = [
  { kind: 'route', name: 'index', icon: 'inbox', label: 'Review' },
  { kind: 'route', name: 'briefs', icon: 'list_alt', label: 'Briefs' },
  { kind: 'create', label: 'Create' },
  { kind: 'route', name: 'messages', icon: 'chat_bubble', label: 'Messages' },
  { kind: 'route', name: 'analytics', icon: 'bar_chart', label: 'Analytics' },
];

const ONBOARDING_ENTRIES: TabBarEntry[] = [
  { kind: 'route', name: 'setup', icon: 'auto_awesome', label: 'Onboarding' },
  { kind: 'route', name: 'index', icon: 'inbox', label: 'Review' },
  { kind: 'route', name: 'briefs', icon: 'list_alt', label: 'Briefs' },
  { kind: 'create', label: 'Create' },
  { kind: 'route', name: 'analytics', icon: 'bar_chart', label: 'Analytics' },
];

export default function AdminTabsLayout() {
  const { profile } = useAuth();
  const router = useRouter();
  const [unreadCount, setUnreadCount] = useState(0);
  const [waitingCount, setWaitingCount] = useState(0);

  const showSetup = profile?.role === 'campaign_manager' && !isManagerSetupCompleteFlag(profile.onboarding_answers);
  const companyId = profile?.active_company_id;

  useFocusEffect(
    useCallback(() => {
      if (companyId === undefined) return;
      const read = () => {
        void unreadInboxCount().then(setUnreadCount).catch(() => undefined);
        void countAssignmentsInFlight().then(setWaitingCount).catch(() => undefined);
      };
      read();
      const timer = setInterval(read, POLL_MS);
      return () => clearInterval(timer);
    }, [companyId]),
  );

  const entries = showSetup ? ONBOARDING_ENTRIES : ADMIN_ENTRIES;
  const onCreate = () => router.push({ pathname: '/(admin)/new-brief', params: { slot: 'new' } });

  return (
    <Tabs
      tabBar={(props) => (
        <TabBar {...props} entries={entries} onCreate={onCreate} counts={{ index: waitingCount || undefined, messages: unreadCount || undefined }} />
      )}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: color.bg },
        animation: screenTransition.tab,
      }}
    >
      <Tabs.Screen name="setup" options={{ title: 'Onboarding', href: showSetup ? undefined : null }} />
      <Tabs.Screen name="index" options={{ title: 'Review' }} />
      <Tabs.Screen name="briefs" options={{ title: 'Briefs' }} />
      <Tabs.Screen name="messages" options={{ title: 'Messages', href: showSetup ? null : undefined }} />
      <Tabs.Screen name="analytics" options={{ title: 'Analytics' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', href: null }} />
    </Tabs>
  );
}
