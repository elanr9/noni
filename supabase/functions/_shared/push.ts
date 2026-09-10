import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

export type PushMessage = {
  title: string;
  body: string;
  data: Record<string, unknown>;
};

/** Sends one message to every token. Returns how many were sent. */
export async function sendExpoPush(
  tokens: string[],
  message: PushMessage,
): Promise<number> {
  if (tokens.length === 0) return 0;
  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(
      tokens.map((to) => ({
        to,
        title: message.title,
        body: message.body,
        data: message.data,
      })),
    ),
  });
  if (!res.ok) {
    throw new Error(`expo push failed: ${res.status} ${await res.text()}`);
  }
  return tokens.length;
}

/** Manager-side roles, matching the is_campaign_manager() SQL helper. */
export const MANAGER_ROLES = ['campaign_manager', 'company_admin', 'admin'];

export async function adminPushTokens(
  admin: SupabaseClient,
  companyId: string,
  exclude?: Set<string>,
): Promise<string[]> {
  const { data } = await admin
    .from('profiles')
    .select('id, expo_push_token')
    .eq('company_id', companyId)
    .in('role', MANAGER_ROLES)
    .not('expo_push_token', 'is', null);
  return (data ?? [])
    .filter((p) => !exclude?.has(p.id as string))
    .map((p) => p.expo_push_token as string | null)
    .filter((t): t is string => Boolean(t));
}

/** Push tokens for an explicit profile id set. */
export async function tokensForProfiles(
  admin: SupabaseClient,
  profileIds: string[],
): Promise<string[]> {
  if (profileIds.length === 0) return [];
  const { data } = await admin
    .from('profiles')
    .select('expo_push_token')
    .in('id', profileIds)
    .not('expo_push_token', 'is', null);
  return (data ?? [])
    .map((p) => p.expo_push_token as string | null)
    .filter((t): t is string => Boolean(t));
}

/** Profiles that muted a manager chat or a creator thread. */
export async function mutedProfileIds(
  admin: SupabaseClient,
  filter: { chatId?: string; creatorId?: string },
): Promise<Set<string>> {
  let query = admin.from('chat_mutes').select('profile_id');
  if (filter.chatId) query = query.eq('chat_id', filter.chatId);
  else if (filter.creatorId) query = query.eq('creator_id', filter.creatorId);
  else return new Set();
  const { data } = await query;
  return new Set((data ?? []).map((m) => m.profile_id as string));
}

export async function creatorPushTokens(
  admin: SupabaseClient,
  creatorId: string,
  companyId: string,
): Promise<string[]> {
  const { data } = await admin
    .from('profiles')
    .select('expo_push_token')
    .eq('id', creatorId)
    .eq('company_id', companyId)
    .maybeSingle();
  return data?.expo_push_token ? [data.expo_push_token as string] : [];
}
