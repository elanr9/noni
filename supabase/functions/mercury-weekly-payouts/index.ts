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
import { formatCentsDollars } from '../_shared/credits.ts';
import { creatorRecipients, sendPushWithPrefs } from '../_shared/push.ts';
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
  testMode = false,
): Promise<PayResult> {
  const amountCents = wallet.available_cents;
  // A test company can be paid out more than once a day from ops, so its key
  // carries the run time; real payouts stay one per creator per week.
  const idempotencyKey = await computeIdempotencyKey(
    wallet.creator_id,
    wallet.company_id,
    testMode ? `${periodEnd}-test-${Date.now()}` : periodEnd,
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

  // 4t. Test company (migration 146): no money moves. Record the payout as
  //     sent and settled at once, the same end state the webhook writes for a
  //     real ACH that cleared.
  if (testMode) {
    const now = new Date().toISOString();
    const { error: settleError } = await admin
      .from('creator_wallets')
      .update({ pending_cents: wallet.pending_cents })
      .eq('id', wallet.id);
    if (settleError) throw settleError;
    const { error: testError } = await admin
      .from('mercury_payouts')
      .update({
        status: 'sent',
        mercury_transaction_id: `test_${payout.id}`,
        sent_at: now,
        settled_at: now,
        failure_reason: null,
      })
      .eq('id', payout.id);
    if (testError) throw testError;
    return { outcome: 'sent', transactionId: `test_${payout.id}` };
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
  testMode = false,
  manual = false,
): Promise<Record<string, unknown>> {
  // One run per company per week; the unique (company_id, period_end) index
  // makes a duplicate hourly firing a no-op. An ops-run test payout skips the
  // claim so it can be repeated; the per-payout key still guards each send.
  if (testMode && manual) {
    return payWallets(admin, companyId, accountId, periodStart, periodEnd, null, true);
  }
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
  return payWallets(admin, companyId, accountId, periodStart, periodEnd, run.id as string, testMode);
}

async function payWallets(
  admin: ReturnType<typeof adminClient>,
  companyId: string,
  accountId: string,
  periodStart: string,
  periodEnd: string,
  runId: string | null,
  testMode: boolean,
): Promise<Record<string, unknown>> {
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
      const result = await payCreator(admin, wallet, accountId, periodStart, periodEnd, testMode);
      if (result.outcome === 'sent') {
        creatorsPaid += 1;
        sentCents += wallet.available_cents;
        // The money already moved: a failed push must never read as a failed payout.
        try {
          await sendPushWithPrefs(
            admin,
            await creatorRecipients(admin, wallet.creator_id, wallet.company_id),
            {
              title: 'You got paid!',
              body: `${formatCentsDollars(wallet.available_cents)} is on its way to your bank.`,
              data: {
                event: 'payout_sent',
                company_id: wallet.company_id,
                deep_link: `noni://creator/${wallet.company_id}/earnings`,
                amount_cents: String(wallet.available_cents),
              },
            },
          );
        } catch (e) {
          console.error(`payout push ${wallet.creator_id}:`, e);
        }
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
  if (runId) {
    await admin
      .from('company_payout_runs')
      .update({
        status: problems.length && creatorsPaid === 0 ? 'failed' : 'transferred',
        charged_cents: sentCents,
        creators_paid: creatorsPaid,
        error: problems.length ? problems.join('; ').slice(0, 2000) : null,
      })
      .eq('id', runId);
  }

  return {
    company_id: companyId,
    run_id: runId,
    ...(testMode ? { test_mode: true } : {}),
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

    const body = (await req.json().catch(() => ({}))) as {
      force?: boolean;
      company_id?: string;
    };

    // Ops "Pay out now" on a test company (migration 146): the platform admin
    // may run one test company at any hour. Nothing else is open to a user.
    const manual = caller.kind === 'user';
    if (manual) {
      if (!caller.platformAdmin || !body.company_id) {
        return jsonResponse({ error: 'forbidden' }, 403);
      }
      const { data: c, error } = await admin
        .from('companies')
        .select('payout_test_mode')
        .eq('id', body.company_id)
        .maybeSingle();
      if (error) throw error;
      if (c?.payout_test_mode !== true) {
        return jsonResponse({ error: 'Only a test company can be paid out by hand.' }, 403);
      }
    }

    const et = etParts();
    if (!manual && body.force !== true && !inEtWindow(PAYOUT_WEEKDAY, PAYOUT_HOUR)) {
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

    // The kill switch guards real money only. Test companies pay on paper, so
    // they run either way; real companies are skipped (before any read or
    // send) until MERCURY_PAYOUTS_ENABLED is 'true'.
    const armed = payoutsArmed();
    const results: Record<string, unknown>[] = [];
    for (const companyId of companyIds) {
      const { data: company, error: companyError } = await admin
        .from('companies')
        .select('payout_test_mode')
        .eq('id', companyId)
        .maybeSingle();
      if (companyError) throw companyError;
      if (!company) continue;
      const testMode = company.payout_test_mode === true;
      if (!testMode && !armed) {
        results.push({
          company_id: companyId,
          skipped: true,
          reason: "payouts disabled: set MERCURY_PAYOUTS_ENABLED='true' to arm real payouts",
        });
        continue;
      }
      // Credits are prepaid and already debited when a post earned, so a real
      // company needs no further gate here. (companies.payouts_enabled was the
      // old Stripe Connect flag and is never set on this rail.)
      results.push(
        await processCompany(
          admin,
          companyId,
          testMode ? 'test' : mercuryAccountId(),
          periodStart,
          periodEnd,
          testMode,
          manual,
        ),
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
