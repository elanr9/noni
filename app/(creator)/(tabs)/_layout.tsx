import { Tabs } from 'expo-router';

import { TabBar } from '../../../components/ui/TabBar';
import type { IconName } from '../../../components/ui/Icon';
import { useAuth } from '../../../lib/auth';
import { isSetupCompleteFlag, useSetupState } from '../../../lib/setup';
import { color, screenTransition } from '../../../theme/tokens';

const CREATOR_ITEMS: Record<string, { icon: IconName; label: string }> = {
  index: { icon: 'house', label: 'Home' },
  posts: { icon: 'layout-list', label: 'Posts' },
  analytics: { icon: 'chart-column', label: 'Analytics' },
  profile: { icon: 'circle-user-round', label: 'Profile' },
};

const ONBOARDING_ITEMS: Record<string, { icon: IconName; label: string }> = {
  index: { icon: 'sparkles', label: 'Onboarding' },
  posts: { icon: 'layout-list', label: 'Posts' },
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
      <Tabs.Screen name="analytics" options={{ title: 'Analytics' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
