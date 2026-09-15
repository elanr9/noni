import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router, type ImperativeRouter as Router } from 'expo-router';
import { Platform } from 'react-native';

import type { AppMode } from './active-mode';
import { modeForDeepLink, parseDeepLink, routeForDeepLink } from './deep-link';
import { routeNotificationTap } from './notification-routing';
import { supabase } from './supabase';

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

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
  prepare?: (data: Record<string, unknown>) => Promise<AppMode | null>,
  setMode?: (mode: AppMode) => Promise<void>,
  nav: Router = router,
): () => void {
  // Push notifications don't exist on web; every Notifications call throws.
  if (Platform.OS === 'web') return () => {};

  const handle = async (response: Notifications.NotificationResponse) => {
    const data = dataFromResponse(response);
    const link = parseDeepLink(data.deep_link);
    let mode: AppMode | null = null;
    if (prepare) {
      try {
        mode = await prepare(data);
      } catch (e) {
        console.error('notification company switch failed', e);
        if (link) return;
      }
    }
    if (link) {
      const wanted = modeForDeepLink(link);
      if (wanted !== (mode ?? getMode()) && setMode) await setMode(wanted);
      nav.push(routeForDeepLink(link) as never);
      return;
    }
    routeNotificationTap(nav, data, mode ?? getMode());
  };

  if (!handledColdStart) {
    handledColdStart = true;
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) void handle(response);
    });
  }

  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    void handle(response);
  });
  return () => sub.remove();
}

/**
 * Foreground push for a company other than the active one: the OS banner
 * already shows; refresh counts so the bell and dot move. Never auto-switch.
 */
export function attachForegroundPushRefresh(
  getActiveCompanyId: () => string | null,
  onOtherCompany: () => void,
): () => void {
  if (Platform.OS === 'web') return () => {};
  const sub = Notifications.addNotificationReceivedListener((notification) => {
    const raw = notification.request.content.data;
    const companyId =
      raw && typeof raw === 'object' && !Array.isArray(raw)
        ? (raw as Record<string, unknown>).company_id
        : undefined;
    if (typeof companyId === 'string' && companyId !== getActiveCompanyId()) {
      onOtherCompany();
    }
  });
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
export async function registerPushToken(
  userId: string,
  options: { ask?: boolean } = {},
): Promise<void> {
  const ask = options.ask ?? true;
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
    if (status !== 'granted' && ask) {
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
