import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router, type Router } from 'expo-router';
import { Platform } from 'react-native';

import type { AppMode } from './active-mode';
import { routeNotificationTap } from './notification-routing';
import { supabase } from './supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function dataFromResponse(
  response: Notifications.NotificationResponse,
): Record<string, unknown> {
  const raw = response.notification.request.content.data;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}

let handledColdStart = false;

/**
 * Wire tap-to-open for cold start and foreground taps. Call once profile/mode
 * are known; pass a getter so late taps use the current mode.
 */
export function attachNotificationRouting(
  getMode: () => AppMode,
  nav: Router = router,
): () => void {
  const handle = (response: Notifications.NotificationResponse) => {
    routeNotificationTap(nav, dataFromResponse(response), getMode());
  };

  if (!handledColdStart) {
    handledColdStart = true;
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) handle(response);
    });
  }

  const sub = Notifications.addNotificationResponseReceivedListener(handle);
  return () => sub.remove();
}

function easProjectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as
    | { eas?: { projectId?: string } }
    | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? undefined;
}

// No-ops on simulators, Android Expo Go (push removed in SDK 53+),
// and until an EAS projectId exists (npx eas init).
export async function registerPushToken(userId: string): Promise<void> {
  try {
    if (!Device.isDevice) return;
    if (Platform.OS === 'android' && Constants.appOwnership === 'expo') return;

    const projectId = easProjectId();
    if (!projectId) return;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.HIGH,
      });
    }

    const { status: existing } = await Notifications.getPermissionsAsync();
    let status = existing;
    if (status !== 'granted') {
      ({ status } = await Notifications.requestPermissionsAsync());
    }
    if (status !== 'granted') return;

    const token = (await Notifications.getExpoPushTokenAsync({ projectId }))
      .data;

    const { error } = await supabase
      .from('profiles')
      .update({ expo_push_token: token })
      .eq('id', userId);
    if (error) throw error;
  } catch (error) {
    console.warn('push registration skipped:', error);
  }
}
