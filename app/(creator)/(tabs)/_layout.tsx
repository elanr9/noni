import { useCallback, useState } from 'react';
import { Tabs, useFocusEffect } from 'expo-router';

import { TabBar } from '../../../components/ui/TabBar';
import type { IconName } from '../../../components/ui/Icon';
import { useAuth } from '../../../lib/auth';
import { unreadCreatorInboxCount } from '../../../lib/creator-inbox-api';
import { isSetupCompleteFlag, useSetupState } from '../../../lib/setup';
import { color, screenTransition } from '../../../theme/tokens';

const UNREAD_POLL_MS = 20_000;

const CREATOR_ITEMS: Record<string, { icon: IconName; label: string }> = {
  index: { icon: 'house', label: 'Home' },
  posts: { icon: 'layout-list', label: 'Posts' },
  messages: { icon: 'message-circle', label: 'Messages' },
  analytics: { icon: 'chart-column', label: 'Analytics' },
  profile: { icon: 'circle-user-round', label: 'Profile' },
};

const ONBOARDING_ITEMS: Record<string, { icon: IconName; label: string }> = {
  index: { icon: 'sparkles', label: 'Onboarding' },
  posts: { icon: 'layout-list', label: 'Posts' },
  messages: { icon: 'message-circle', label: 'Messages' },
  analytics: { icon: 'chart-column', label: 'Analytics' },
  profile: { icon: 'circle-user-round', label: 'Profile' },
};

export default function CreatorTabsLayout() {
  const { profile } = useAuth();
  const flagged =
    profile !== null && isSetupCompleteFlag(profile.onboarding_answers);
  const setup = useSetupState(!flagged ? profile : null);
  const onboarding =
    !flagged && (setup.state === null || !setup.state.complete);

  const companyId = profile?.company_id;
  const meId = profile?.id;
  const [unread, setUnread] = useState(0);

  useFocusEffect(
    useCallback(() => {
      if (companyId === undefined || meId === undefined) return;
      const read = () => {
        void unreadCreatorInboxCount(companyId, meId)
          .then(setUnread)
          .catch(() => undefined);
      };
      read();
      const timer = setInterval(read, UNREAD_POLL_MS);
      return () => clearInterval(timer);
    }, [companyId, meId]),
  );

  return (
    <Tabs
      tabBar={(props) => (
        <TabBar
          {...props}
          items={onboarding ? ONBOARDING_ITEMS : CREATOR_ITEMS}
          locked={onboarding}
          lockedRoutes={['posts', 'analytics']}
        />
      )}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: color.offWhite },
        animation: screenTransition.tab,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: onboarding ? 'Onboarding' : 'Home' }}
      />
      <Tabs.Screen name="posts" options={{ title: 'Posts' }} />
      <Tabs.Screen
        name="messages"
        options={{ title: 'Messages', tabBarBadge: unread > 0 ? unread : undefined }}
      />
      <Tabs.Screen name="analytics" options={{ title: 'Analytics' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
