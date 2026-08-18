// Sunday 20:00 America/New_York — the Mercury payout run.
//
// Replaces weekly-payouts (Stripe) for creators on payout_rail='mercury'.
// Cron fires hourly; this gates on the Eastern window so the schedule survives
// daylight saving without edits.
//
// Ledger model (invariant: sum(wallet_ledger.amount_cents) == available_cents):
//   send      payout_hold -amount, available -= amount, pending += amount
//   settled   webhook clears pending. NO second ledger row — the hold was the
//             debit. A payout_paid -amount here would double-debit the creator,
//             which is exactly the drift the Stripe rail has today.
//   failed    webhook writes payout_failed +amount and restores available.

import {
  adminClient,
  authenticate,
  handleCors,
  jsonResponse,
} from '../_shared/wp8.ts';
import { addDays, etParts, inEtWindow } from '../_shared/et-window.ts';
import {
  callProxy,
  centsToDollars,
  computeIdempotencyKey,
  mercuryAccountId,
  MercuryProxyError,
  type MercuryTransaction,
} from '../_shared/mercury.ts';

const PAYOUT_WEEKDAY = 'Sun';
const PAYOUT_HOUR = 20;

/**
 * Master kill switch, checked before anything is read or sent.
 *
 * Fails closed: only the exact string 'true' arms the run. Unset, 'false', or
 * any typo leaves it dormant, so the cron can be deployed and left in place
 * while the rail is still being validated. Flipping this is the single action
 * that takes Noni live on Mercury — and the fastest way to stop it again.
 */
function payoutsArmed(): boolean {
  return Deno.env.get('MERCURY_PAYOUTS_ENABLED') === 'true';
}

type Wallet = {
  id: string;
  company_id: string;
  creator_id: string;
  available_cents: number;
  pending_cents: number;
  mercury_recipient_id: string | null;
};

type PayResult =
  | { outcome: 'sent'; transactionId: string }
  | { outcome: 'rejected'; reason: string }
  | { outcome: 'unknown'; reason: string }
  | { outcome: 'skipped'; reason: string };

/**
 * Pay one creator.
 *
 * The mercury_payouts row and the hold are written BEFORE Mercury is called.
 * Mercury has no cancel endpoint and no way to look a payment up by idempotency
 * key, so a crash between "called" and "recorded" must never be able to look
 * like "not yet sent" — otherwise the next run pays again.
 */
async function payCreator(
  admin: ReturnType<typeof adminClient>,
  wallet: Wallet,
  accountId: string,
  periodStart: string,
  periodEnd: string,
): Promise<PayResult> {
  const amountCents = wallet.available_cents;
  const idempotencyKey = await computeIdempotencyKey(
    wallet.creator_id,
    wallet.company_id,
    periodEnd,
  );

  // 1. Claim the payout. The unique index on idempotency_key is the real
  //    guard: a concurrent or retried run collides here, before money moves.
  const { data: payout, error: payoutError } = await admin
    .from('mercury_payouts')
    .insert({
      company_id: wallet.company_id,
      creator_id: wallet.creator_id,
      amount_cents: amountCents,
      idempotency_key: idempotencyKey,
      status: 'scheduled',
      period_start: periodStart,
      period_end: periodEnd,
    })
    .select('id')
    .single();
  if (payoutError) {
    if (payoutError.code === '23505') {
      return { outcome: 'skipped', reason: 'already attempted for this period' };
    }
    throw payoutError;
  }

  // 2. Hold: the single debit against available_cents.
  const { error: holdError } = await admin.from('wallet_ledger').insert({
    company_id: wallet.company_id,
    creator_id: wallet.creator_id,
    kind: 'payout_hold',
    amount_cents: -amountCents,
    mercury_payout_id: payout.id,
    note: `Mercury payout hold for week ending ${periodEnd}`,
  });
  if (holdError) {
    await admin.from('mercury_payouts').delete().eq('id', payout.id);
    throw holdError;
  }

  // 3. Move the money out of available. Optimistic on available_cents so a
  //    concurrent credit cannot be silently overwritten.
  const { data: held, error: balError } = await admin
    .from('creator_wallets')
    .update({
      available_cents: wallet.available_cents - amountCents,
      pending_cents: wallet.pending_cents + amountCents,
    })
    .eq('id', wallet.id)
    .eq('available_cents', wallet.available_cents)
    .select('id');
  if (balError) throw balError;
  if (!held?.length) {
    // Nothing was sent, so unwind completely rather than leaving a phantom hold.
    await admin.from('wallet_ledger').delete().eq('mercury_payout_id', payout.id);
    await admin.from('mercury_payouts').delete().eq('id', payout.id);
    return { outcome: 'skipped', reason: 'balance changed mid-run' };
  }

  // 4. Send.
  let txn: MercuryTransaction;
  try {
    txn = await callProxy<MercuryTransaction>('/send-money', 'POST', {
      accountId,
      recipientId: wallet.mercury_recipient_id,
      amount: centsToDollars(amountCents),
      idempotencyKey,
      paymentMethod: 'ach',
      externalMemo: 'Noni creator payout',
      note: `Week ending ${periodEnd}`,
    });
  } catch (e) {
    const reason = e instanceof Error ? e.message : 'send failed';

    // A 4xx is Mercury refusing the request outright — nothing moved, so it is
    // safe to reverse the hold and hand the money back.
    if (e instanceof MercuryProxyError && e.isClientError) {
      await admin.from('wallet_ledger').insert({
        company_id: wallet.company_id,
        creator_id: wallet.creator_id,
        kind: 'payout_failed',
        amount_cents: amountCents,
        mercury_payout_id: payout.id,
        note: reason.slice(0, 500),
      });
      await admin
        .from('creator_wallets')
        .update({
          available_cents: wallet.available_cents,
          pending_cents: wallet.pending_cents,
        })
        .eq('id', wallet.id);
      await admin
        .from('mercury_payouts')
        .update({ status: 'failed', failure_reason: reason.slice(0, 500) })
        .eq('id', payout.id);
      return { outcome: 'rejected', reason };
    }

    // Timeout, 502, proxy down: we do NOT know whether Mercury accepted it.
    // Leave the hold in place — that is what stops next week's run from paying
    // the same money again — and leave the row 'scheduled' so it surfaces in
    // mercury_payouts_unsettled_idx for a human to reconcile against the
    // Mercury dashboard. Reversing here would risk paying twice.
    await admin
      .from('mercury_payouts')
      .update({ failure_reason: `UNRESOLVED — verify in Mercury before acting: ${reason}`.slice(0, 500) })
      .eq('id', payout.id);
    return { outcome: 'unknown', reason };
  }

  // 5. Accepted. Mercury reports 'pending' for an ACH in flight; our local
  //    equivalent is 'sending' until the webhook says otherwise.
  const { error: updError } = await admin
    .from('mercury_payouts')
    .update({
      status: 'sending',
      mercury_transaction_id: txn.id,
      sent_at: new Date().toISOString(),
    })
    .eq('id', payout.id);
  if (updError) throw updError;

  return { outcome: 'sent', transactionId: txn.id };
}

async function processCompany(
  admin: ReturnType<typeof adminClient>,
  companyId: string,
  accountId: string,
  periodStart: string,
  periodEnd: string,
): Promise<Record<string, unknown>> {
  // One run per company per week; the unique (company_id, period_end) index
  // makes a duplicate hourly firing a no-op.
  const { data: run, error: claimError } = await admin
    .from('company_payout_runs')
    .insert({
      company_id: companyId,
      period_start: periodStart,
      period_end: periodEnd,
      status: 'pending',
      charged_cents: 0,
      creators_paid: 0,
    })
    .select('id')
    .maybeSingle();
  if (claimError) {
    if (claimError.code === '23505') {
      return { company_id: companyId, skipped: true, reason: 'already claimed' };
    }
    throw claimError;
  }
  if (!run) return { company_id: companyId, skipped: true, reason: 'already claimed' };

  const { data: wallets, error: walletsError } = await admin
    .from('creator_wallets')
    .select('id, company_id, creator_id, available_cents, pending_cents, mercury_recipient_id')
    .eq('company_id', companyId)
    .eq('payout_ready', true)
    .eq('payout_rail', 'mercury')
    .gt('available_cents', 0);
  if (walletsError) throw walletsError;

  const payable = ((wallets ?? []) as Wallet[]).filter((w) => {
    if (!w.mercury_recipient_id) {
      console.error(
        `mercury-weekly-payouts: wallet ${w.id} is payout_ready with no recipient id`,
      );
      return false;
    }
    return true;
  });

  let sentCents = 0;
  let creatorsPaid = 0;
  const rejected: string[] = [];
  const unresolved: string[] = [];
  const skipped: string[] = [];

  for (const wallet of payable) {
    try {
      const result = await payCreator(admin, wallet, accountId, periodStart, periodEnd);
      if (result.outcome === 'sent') {
        creatorsPaid += 1;
        sentCents += wallet.available_cents;
      } else if (result.outcome === 'rejected') {
        rejected.push(`${wallet.creator_id}: ${result.reason}`);
      } else if (result.outcome === 'unknown') {
        unresolved.push(`${wallet.creator_id}: ${result.reason}`);
      } else {
        skipped.push(`${wallet.creator_id}: ${result.reason}`);
      }
    } catch (e) {
      rejected.push(`${wallet.creator_id}: ${e instanceof Error ? e.message : 'payout failed'}`);
    }
  }

  const problems = [...rejected, ...unresolved];
  await admin
    .from('company_payout_runs')
    .update({
      status: problems.length && creatorsPaid === 0 ? 'failed' : 'transferred',
      charged_cents: sentCents,
      creators_paid: creatorsPaid,
      error: problems.length ? problems.join('; ').slice(0, 2000) : null,
    })
    .eq('id', run.id);

  return {
    company_id: companyId,
    run_id: run.id,
    eligible: payable.length,
    creators_paid: creatorsPaid,
    sent_cents: sentCents,
    ...(rejected.length ? { rejected } : {}),
    ...(unresolved.length ? { needs_reconciliation: unresolved } : {}),
    ...(skipped.length ? { skipped } : {}),
  };
}

Deno.serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;

  try {
    const admin = adminClient();
    const caller = await authenticate(req, admin);
    if (!caller) return jsonResponse({ error: 'unauthorized' }, 401);
    if (caller.kind !== 'cron') return jsonResponse({ error: 'forbidden' }, 403);

    // Checked before any query and before the time window, so a dormant
    // deployment touches neither the database nor Mercury. Placed after auth
    // only so an unauthenticated caller cannot probe the flag's state.
    if (!payoutsArmed()) {
      console.log('mercury-weekly-payouts: payouts disabled (MERCURY_PAYOUTS_ENABLED)');
      return jsonResponse({
        skipped: true,
        reason: 'payouts disabled',
        hint: "set MERCURY_PAYOUTS_ENABLED='true' to arm the Sunday run",
      });
    }

    const body = (await req.json().catch(() => ({}))) as {
      force?: boolean;
      company_id?: string;
    };

    const et = etParts();
    if (body.force !== true && !inEtWindow(PAYOUT_WEEKDAY, PAYOUT_HOUR)) {
      return jsonResponse({
        skipped: true,
        reason: `outside ${PAYOUT_WEEKDAY} ${PAYOUT_HOUR}:00-${PAYOUT_HOUR}:59 America/New_York`,
        et_weekday: et.weekday,
        et_hour: et.hour,
        et_date: et.date,
      });
    }

    const periodEnd = et.date;
    const periodStart = addDays(periodEnd, -6);
    const accountId = mercuryAccountId();

    let companyIds: string[];
    if (body.company_id) {
      companyIds = [body.company_id];
    } else {
      const { data: rows, error } = await admin
        .from('creator_wallets')
        .select('company_id')
        .eq('payout_ready', true)
        .eq('payout_rail', 'mercury')
        .gt('available_cents', 0);
      if (error) throw error;
      companyIds = [...new Set((rows ?? []).map((r) => r.company_id as string))];
    }

    const results: Record<string, unknown>[] = [];
    for (const companyId of companyIds) {
      const { data: company, error: companyError } = await admin
        .from('companies')
        .select('payouts_enabled')
        .eq('id', companyId)
        .maybeSingle();
      if (companyError) throw companyError;
      if (company?.payouts_enabled !== true) {
        results.push({ company_id: companyId, skipped: true, reason: 'payouts disabled' });
        continue;
      }
      results.push(
        await processCompany(admin, companyId, accountId, periodStart, periodEnd),
      );
    }

    return jsonResponse({
      period_start: periodStart,
      period_end: periodEnd,
      companies: results.length,
      results,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'mercury-weekly-payouts failed';
    console.error('mercury-weekly-payouts', message);
    return jsonResponse({ error: message }, 500);
  }
});
