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
): Promise<string[]> {
  const { data } = await admin
    .from('profiles')
    .select('expo_push_token')
    .eq('company_id', companyId)
    .in('role', MANAGER_ROLES)
    .not('expo_push_token', 'is', null);
  return (data ?? [])
    .map((p) => p.expo_push_token as string | null)
    .filter((t): t is string => Boolean(t));
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
