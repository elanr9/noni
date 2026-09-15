import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { MANAGER_MEMBER_ROLES } from './membership.ts';

/**
 * Every push carries company_id and deep_link (see deep-link.ts) so the app
 * can switch company before routing, and every push is also stored in
 * public.notifications for the cross-company feed.
 */
export type PushMessage = {
  title: string;
  body: string;
  data: Record<string, unknown> & {
    event: string;
    company_id: string;
    deep_link: string;
  };
};

export type Recipient = {
  profileId: string;
  token: string | null;
};

/** Stores one notification per recipient, then pushes to those with a token. */
export async function sendPush(
  admin: SupabaseClient,
  recipients: Recipient[],
  message: PushMessage,
): Promise<number> {
  const unique = new Map<string, Recipient>();
  for (const r of recipients) unique.set(r.profileId, r);
  const list = [...unique.values()];
  if (list.length === 0) return 0;

  const { error } = await admin.from('notifications').insert(
    list.map((r) => ({
      company_id: message.data.company_id,
      profile_id: r.profileId,
      event: message.data.event,
      title: message.title,
      body: message.body,
      deep_link: message.data.deep_link,
      data: message.data,
    })),
  );
  if (error) throw new Error(`notification insert failed: ${error.message}`);

  const tokens = list
    .map((r) => r.token)
    .filter((t): t is string => Boolean(t));
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

type RosterRow = { id: string; expo_push_token: string | null };

function toRecipients(rows: RosterRow[] | null): Recipient[] {
  return (rows ?? []).map((r) => ({ profileId: r.id, token: r.expo_push_token ?? null }));
}

/** Managers of a company (membership based), minus excluded profile ids. */
export async function adminRecipients(
  admin: SupabaseClient,
  companyId: string,
  exclude?: Set<string>,
): Promise<Recipient[]> {
  const { data } = await admin
    .from('company_roster')
    .select('id, expo_push_token')
    .eq('company_id', companyId)
    .in('member_role', MANAGER_MEMBER_ROLES);
  return toRecipients(data as RosterRow[] | null).filter((r) => !exclude?.has(r.profileId));
}

/** Explicit profile id set. */
export async function recipientsForProfiles(
  admin: SupabaseClient,
  profileIds: string[],
): Promise<Recipient[]> {
  if (profileIds.length === 0) return [];
  const { data } = await admin
    .from('profiles')
    .select('id, expo_push_token')
    .in('id', profileIds);
  return toRecipients(data as RosterRow[] | null);
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

/** One creator, only if they are a member of the company. */
export async function creatorRecipients(
  admin: SupabaseClient,
  creatorId: string,
  companyId: string,
): Promise<Recipient[]> {
  const { data } = await admin
    .from('company_roster')
    .select('id, expo_push_token')
    .eq('id', creatorId)
    .eq('company_id', companyId)
    .maybeSingle();
  return data ? toRecipients([data as RosterRow]) : [];
}
