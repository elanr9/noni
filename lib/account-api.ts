import { FunctionsHttpError } from '@supabase/supabase-js';

import { supabase } from './supabase';

/** The caller is the only company admin of a team that still has members. */
export class SoleAdminError extends Error {
  readonly companies: string[];
  constructor(companies: string[]) {
    super(
      companies.length === 1
        ? `You are the only admin of ${companies[0]}. Make someone else an admin on the web console first.`
        : `You are the only admin of ${companies.join(', ')}. Make someone else an admin on the web console first.`,
    );
    this.name = 'SoleAdminError';
    this.companies = companies;
  }
}

type DeleteResponse = { deleted?: boolean; ok?: boolean; error?: string; message?: string; companies?: string[] };

async function readError(error: unknown): Promise<DeleteResponse | null> {
  if (error instanceof FunctionsHttpError) {
    try {
      return (await (error.context as Response).json()) as DeleteResponse;
    } catch {
      return null;
    }
  }
  return null;
}

async function callDelete(dryRun: boolean): Promise<void> {
  const { data, error } = await supabase.functions.invoke('delete-account', {
    body: dryRun ? { dry_run: true } : {},
  });
  const body = error ? await readError(error) : (data as DeleteResponse | null);
  if (body?.error === 'sole_admin') throw new SoleAdminError(body.companies ?? []);
  if (body?.error) throw new Error(body.message ?? 'Could not delete your account. Try again.');
  if (error) throw new Error('Could not reach Noni. Check your connection and try again.');
}

/** Throws SoleAdminError when deleting would leave a team without an admin. */
export async function checkCanDeleteAccount(): Promise<void> {
  await callDelete(true);
}

/**
 * Permanently deletes the signed-in account: memberships end, the profile is
 * scrubbed and the sign-in is removed. Call signOut() after it resolves.
 * Throws SoleAdminError when the caller must hand over a company first.
 */
export async function deleteMyAccount(): Promise<void> {
  await callDelete(false);
}

/** Push categories. A missing key means on. */
export type NotificationCategory = 'submissions' | 'reviews' | 'messages' | 'live' | 'streaks' | 'briefs' | 'reminders' | 'earnings';
export type NotificationPrefs = Partial<Record<NotificationCategory, boolean>>;

function parsePrefs(raw: unknown): NotificationPrefs {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: NotificationPrefs = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'boolean') out[k as NotificationCategory] = v;
  }
  return out;
}

export function prefOn(prefs: NotificationPrefs, key: NotificationCategory): boolean {
  return prefs[key] !== false;
}

// notification_prefs and set_notification_pref land with migration 126; the
// generated types catch up on the next regen.
type Untyped = {
  from: (t: string) => {
    select: (c: string) => { eq: (k: string, v: string) => { maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: Error | null }> } };
  };
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: Error | null }>;
};
const db = supabase as unknown as Untyped;

export async function getNotificationPrefs(userId: string): Promise<NotificationPrefs> {
  const { data, error } = await db.from('profiles').select('notification_prefs').eq('id', userId).maybeSingle();
  if (error) throw error;
  return parsePrefs(data?.notification_prefs);
}

export async function setNotificationPref(key: NotificationCategory, on: boolean): Promise<NotificationPrefs> {
  const { data, error } = await db.rpc('set_notification_pref', { p_key: key, p_on: on });
  if (error) throw error;
  return parsePrefs(data);
}
