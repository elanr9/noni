import type { Router } from 'expo-router';

import type { AppMode } from './active-mode';

type PushData = Record<string, unknown>;

function str(data: PushData, key: string): string | null {
  const v = data[key];
  return typeof v === 'string' && v.length > 0 ? v : null;
}

/**
 * Route a tapped Expo push into the right screen for the active mode.
 */
export function routeNotificationTap(
  router: Router,
  data: PushData,
  mode: AppMode,
): void {
  const event = str(data, 'event');
  const assignmentId = str(data, 'assignment_id');
  const taskId = str(data, 'task_id');
  const creatorId = str(data, 'creator_id');
  const campaignId = str(data, 'campaign_id');

  if (mode === 'admin') {
    // Billing moved to the web dashboard; land on settings where its link lives.
    if (event === 'credits_low' || event === 'company_topup' || event === 'company_spend') {
      router.push('/(admin)/(tabs)/settings');
      return;
    }
    if (event === 'message' && creatorId) {
      router.push(`/(admin)/chat/${creatorId}`);
      return;
    }
    if (event === 'account_submitted' && creatorId) {
      router.push(`/(admin)/creator/${creatorId}`);
      return;
    }
    if (event === 'music_pending' && assignmentId) {
      router.push(`/(admin)/review/${assignmentId}`);
      return;
    }
    if (event === 'submitted' || event === 'comment') {
      if (assignmentId) {
        router.push(`/(admin)/review/${assignmentId}`);
        return;
      }
      router.push('/(admin)/(tabs)');
      return;
    }
    if (event === 'milestone') {
      router.push('/(admin)/(tabs)/analytics');
      return;
    }
    if (campaignId) {
      router.push(`/(admin)/week/${campaignId}`);
      return;
    }
    router.push('/(admin)/(tabs)');
    return;
  }

  // Creator mode
  if (event === 'message') {
    router.push('/(creator)/chat');
    return;
  }
  if (event === 'account_decided' || event === 'account_submitted') {
    router.push('/(creator)/(tabs)');
    return;
  }
  if (event === 'post_live' || event === 'milestone') {
    const tiktok = str(data, 'tiktok_url');
    const ig = str(data, 'instagram_url');
    if (assignmentId) {
      router.push(`/(creator)/posts/${assignmentId}`);
      return;
    }
    if (event === 'milestone') {
      router.push('/(creator)/(tabs)');
      return;
    }
    if (tiktok || ig) {
      router.push('/(creator)/(tabs)/posts');
      return;
    }
  }
  if (
    event === 'approved' ||
    event === 'changes_requested' ||
    event === 'comment' ||
    event === 'bounty_earned' ||
    event === 'music_approved'
  ) {
    if (assignmentId) {
      router.push(`/(creator)/assignment/${assignmentId}`);
      return;
    }
    if (taskId) {
      router.push(`/(creator)/post/${taskId}`);
      return;
    }
  }
  if (
    event === 'published' ||
    event === 'due_today' ||
    event === 'overdue' ||
    event === 'streak_bonus' ||
    event === 'streak_progress'
  ) {
    if (assignmentId) {
      router.push(`/(creator)/assignment/${assignmentId}`);
      return;
    }
    router.push('/(creator)/(tabs)');
    return;
  }

  if (assignmentId) {
    router.push(`/(creator)/assignment/${assignmentId}`);
    return;
  }
  router.push('/(creator)/(tabs)');
}
