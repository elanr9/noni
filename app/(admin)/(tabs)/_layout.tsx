import { useCallback, useState } from 'react';
import { Tabs, useFocusEffect, useRouter } from 'expo-router';

import { TabBar, type TabBarEntry } from '../../../components/v2';
import { countWaitingForReview } from '../../../lib/admin-api';
import { reviewTotal, useReviewQueue } from '../../../lib/admin-review-queue';
import { useAuth } from '../../../lib/auth';
import { useCompany } from '../../../lib/company-context';
import { unreadDmCount } from '../../../lib/inbox-api';
import { color, screenTransition } from '../../../theme/v2';

// v2 shell: Review, Briefs, Market, the Create button, Messages, Analytics.
// Always the same six. The onboarding checklist (setup) stays in the folder,
// hidden from the bar; Review's first-run card links to it until it is done.
const POLL_MS = 45_000;

const ADMIN_ENTRIES: TabBarEntry[] = [
  { kind: 'route', name: 'index', icon: 'inbox', label: 'Review' },
  { kind: 'route', name: 'briefs', icon: 'list_alt', label: 'Briefs' },
  { kind: 'route', name: 'market', icon: 'storefront', label: 'Market' },
  { kind: 'create', label: 'Create' },
  { kind: 'route', name: 'messages', icon: 'chat_bubble', label: 'Messages' },
  { kind: 'route', name: 'analytics', icon: 'bar_chart', label: 'Analytics' },
];

export default function AdminTabsLayout() {
  const { profile } = useAuth();
  const { elsewhereTotal } = useCompany();
  const router = useRouter();
  const [unreadCount, setUnreadCount] = useState(0);
  const [polledWaiting, setPolledWaiting] = useState(0);

  const companyId = profile?.active_company_id;
  const meId = profile?.id;

  // The Review store is the truth once it has loaded this company (it drops
  // approved items at once); the poll covers the time before that.
  const storeWaiting = useReviewQueue((s) => (s.companyId === companyId && s.status === 'ready' ? reviewTotal(s) : null));
  const waitingCount = storeWaiting ?? polledWaiting;

  useFocusEffect(
    useCallback(() => {
      if (companyId === undefined || meId === undefined) return;
      const read = () => {
        void unreadDmCount(companyId, meId).then(setUnreadCount).catch(() => undefined);
        void countWaitingForReview(companyId).then(setPolledWaiting).catch(() => undefined);
        const q = useReviewQueue.getState();
        if (q.companyId === companyId && q.status === 'ready') void q.load(companyId, { quiet: true });
      };
      read();
      const timer = setInterval(read, POLL_MS);
      return () => clearInterval(timer);
    }, [companyId, meId]),
  );

  const onCreate = () => router.push({ pathname: '/(admin)/new-brief', params: { slot: 'new' } });

  return (
    <Tabs
      tabBar={(props) => (
        <TabBar
          {...props}
          entries={ADMIN_ENTRIES}
          onCreate={onCreate}
          counts={{ index: waitingCount || undefined, messages: unreadCount || undefined }}
          // Red dot: a creator is waiting on you in another company (or on the other side).
          dots={{ index: elsewhereTotal > 0 }}
        />
      )}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: color.bg },
        animation: screenTransition.tab,
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Review' }} />
      <Tabs.Screen name="briefs" options={{ title: 'Briefs' }} />
      <Tabs.Screen name="market" options={{ title: 'Market' }} />
      <Tabs.Screen name="messages" options={{ title: 'Messages' }} />
      <Tabs.Screen name="analytics" options={{ title: 'Analytics' }} />
      <Tabs.Screen name="setup" options={{ title: 'Onboarding', href: null }} />
    </Tabs>
  );
}
