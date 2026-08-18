// Saturday 15:00 America/New_York — safety net for payout onboarding.
//
// Two jobs:
//   1. Catch creators who finished Mercury onboarding but never came back to
//      tap "I'm done". Mercury has no recipient webhook, so without this they
//      would sit unpayable until they happened to reopen the app.
//   2. Nudge creators whose invite has been sitting untouched for three days.
//
// Runs the day before the Sunday payout so anyone swept in gets paid that week.

import {
  adminClient,
  authenticate,
  handleCors,
  jsonResponse,
} from '../_shared/wp8.ts';
import { etParts, inEtWindow } from '../_shared/et-window.ts';
import {
  callProxy,
  getCreatorEmail,
  type MercuryInvite,
  type MercuryInviteList,
} from '../_shared/mercury.ts';
import { sendMercuryReminderEmail } from '../_shared/mercury-emails.ts';

const SWEEP_WEEKDAY = 'Sat';
const SWEEP_HOUR = 15;
const REMINDER_AFTER_DAYS = 3;
// Bounds a runaway page walk. Anything beyond this is reported, never silently
// dropped — see the capped flag in the response.
const MAX_PAGES = 20;
const PAGE_SIZE = 1000;

type PendingWallet = {
  id: string;
  company_id: string;
  creator_id: string;
  mercury_invite_id: string;
};

/**
 * Walk Mercury's completed invites and flip any wallet still marked 'created'.
 *
 * Paging stops as soon as every locally-pending invite has been matched, so the
 * common case (nothing new) costs a single request even after the completed
 * list has grown for years.
 */
async function sweepCompleted(
  admin: ReturnType<typeof adminClient>,
): Promise<Record<string, unknown>> {
  const { data: pendingRows, error } = await admin
    .from('creator_wallets')
    .select('id, company_id, creator_id, mercury_invite_id')
    .eq('mercury_invite_status', 'created')
    .not('mercury_invite_id', 'is', null);
  if (error) throw error;

  const pending = new Map<string, PendingWallet>();
  for (const w of (pendingRows ?? []) as PendingWallet[]) {
    pending.set(w.mercury_invite_id, w);
  }
  if (pending.size === 0) {
    return { swept: 0, pending_before: 0, pages: 0, capped: false };
  }

  const matched: MercuryInvite[] = [];
  let cursor: string | undefined;
  let pages = 0;
  let capped = false;

  while (pending.size > matched.length) {
    if (pages >= MAX_PAGES) {
      capped = true;
      break;
    }
    const query = new URLSearchParams({
      status: 'completed',
      limit: String(PAGE_SIZE),
      order: 'desc',
    });
    if (cursor) query.set('start_after', cursor);

    const page = await callProxy<MercuryInviteList>(`/invites?${query}`, 'GET');
    pages += 1;

    const invites = page?.invites ?? [];
    for (const invite of invites) {
      if (pending.has(invite.id)) matched.push(invite);
    }
    cursor = page?.page?.nextPage;
    if (!cursor || invites.length === 0) break;
  }

  let swept = 0;
  const failures: string[] = [];
  for (const invite of matched) {
    const wallet = pending.get(invite.id);
    if (!wallet) continue;
    const { error: updateError } = await admin
      .from('creator_wallets')
      .update({
        mercury_invite_status: 'completed',
        mercury_recipient_id: invite.recipientId,
        mercury_onboarded_at: new Date().toISOString(),
        payout_ready: true,
        payout_rail: 'mercury',
        mercury_onboarding_url: null,
      })
      .eq('id', wallet.id)
      // Do not clobber a wallet the app already verified between our read and
      // this write.
      .eq('mercury_invite_status', 'created');
    if (updateError) {
      failures.push(`${wallet.creator_id}: ${updateError.message}`);
      continue;
    }
    swept += 1;
  }

  return {
    swept,
    pending_before: pending.size,
    pages,
    capped,
    ...(capped
      ? { warning: `stopped after ${MAX_PAGES} pages; ${pending.size - matched.length} invites unchecked` }
      : {}),
    ...(failures.length ? { failures } : {}),
  };
}

/** Nudge invites still outstanding after REMINDER_AFTER_DAYS. */
async function sendReminders(
  admin: ReturnType<typeof adminClient>,
): Promise<Record<string, unknown>> {
  const cutoff = new Date(Date.now() - REMINDER_AFTER_DAYS * 86_400_000).toISOString();

  const { data: stale, error } = await admin
    .from('creator_wallets')
    .select('id, creator_id, mercury_onboarding_url')
    .eq('mercury_invite_status', 'created')
    .lt('mercury_invite_sent_at', cutoff)
    .is('mercury_invite_reminder_sent_at', null)
    .not('mercury_onboarding_url', 'is', null);
  if (error) throw error;

  let sent = 0;
  const failures: string[] = [];
  for (const wallet of stale ?? []) {
    try {
      const email = await getCreatorEmail(admin, wallet.creator_id as string);
      const { data: profile } = await admin
        .from('profiles')
        .select('full_name')
        .eq('id', wallet.creator_id)
        .maybeSingle();

      await sendMercuryReminderEmail(
        email,
        profile?.full_name ?? null,
        wallet.mercury_onboarding_url as string,
      );

      // Stamped only after a successful send, so a Resend outage retries next
      // week rather than silently burning the one reminder a creator gets.
      const { error: stampError } = await admin
        .from('creator_wallets')
        .update({ mercury_invite_reminder_sent_at: new Date().toISOString() })
        .eq('id', wallet.id);
      if (stampError) throw stampError;
      sent += 1;
    } catch (e) {
      failures.push(
        `${wallet.creator_id}: ${e instanceof Error ? e.message : 'reminder failed'}`,
      );
    }
  }

  return { reminders_sent: sent, candidates: (stale ?? []).length, ...(failures.length ? { failures } : {}) };
}

Deno.serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;

  try {
    const admin = adminClient();
    const caller = await authenticate(req, admin);
    if (!caller) return jsonResponse({ error: 'unauthorized' }, 401);
    if (caller.kind !== 'cron') {
      return jsonResponse({ error: 'forbidden' }, 403);
    }

    const body = (await req.json().catch(() => ({}))) as { force?: boolean };
    const et = etParts();
    if (body.force !== true && !inEtWindow(SWEEP_WEEKDAY, SWEEP_HOUR)) {
      return jsonResponse({
        skipped: true,
        reason: `outside ${SWEEP_WEEKDAY} ${SWEEP_HOUR}:00-${SWEEP_HOUR}:59 America/New_York`,
        et_weekday: et.weekday,
        et_hour: et.hour,
      });
    }

    // Reminders run even if the sweep throws — a Mercury outage should not also
    // cost creators their nudge.
    let sweep: Record<string, unknown>;
    try {
      sweep = await sweepCompleted(admin);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'sweep failed';
      console.error('mercury-onboarding-sweep sweep', message);
      sweep = { error: message };
    }

    const reminders = await sendReminders(admin);

    return jsonResponse({ et_date: et.date, sweep, reminders });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'mercury-onboarding-sweep failed';
    console.error('mercury-onboarding-sweep', message);
    return jsonResponse({ error: message }, 500);
  }
});
