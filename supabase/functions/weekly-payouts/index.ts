import Stripe from 'npm:stripe@17';
import { adminClient, authenticate, handleCors, jsonResponse } from '../_shared/wp8.ts';

function stripeClient(): Stripe {
  const key = Deno.env.get('STRIPE_SECRET_KEY');
  if (!key) throw new Error('STRIPE_SECRET_KEY missing');
  return new Stripe(key);
}

type NyParts = {
  weekday: string;
  hour: number;
  date: string; // YYYY-MM-DD in America/New_York
};

function getNyParts(d = new Date()): NyParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return {
    weekday: get('weekday'),
    hour: Number(get('hour')),
    date: `${get('year')}-${get('month')}-${get('day')}`,
  };
}

function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  utc.setUTCDate(utc.getUTCDate() + days);
  return utc.toISOString().slice(0, 10);
}

type WalletRow = {
  id: string;
  company_id: string;
  creator_id: string;
  available_cents: number;
  pending_cents: number;
  stripe_connect_account_id: string;
};

async function payCreator(
  admin: ReturnType<typeof adminClient>,
  stripe: Stripe,
  wallet: WalletRow,
  amountCents: number,
  runId: string,
): Promise<{ payout_id: string; transfer_id: string }> {
  const { data: payout, error: payoutError } = await admin
    .from('payouts')
    .insert({
      company_id: wallet.company_id,
      creator_id: wallet.creator_id,
      amount_cents: amountCents,
      status: 'pending',
    })
    .select('*')
    .single();
  if (payoutError) throw payoutError;

  const { error: holdError } = await admin.from('wallet_ledger').insert({
    company_id: wallet.company_id,
    creator_id: wallet.creator_id,
    kind: 'payout_hold',
    amount_cents: -amountCents,
    payout_id: payout.id,
    note: `Weekly payout hold run ${runId}`,
  });
  if (holdError) throw holdError;

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
    await admin.from('wallet_ledger').delete().eq('payout_id', payout.id);
    await admin.from('payouts').delete().eq('id', payout.id);
    throw new Error(`Balance changed for creator ${wallet.creator_id}`);
  }

  let transfer: Stripe.Transfer;
  try {
    transfer = await stripe.transfers.create({
      amount: amountCents,
      currency: 'usd',
      destination: wallet.stripe_connect_account_id,
      metadata: {
        payout_id: payout.id,
        company_id: wallet.company_id,
        creator_id: wallet.creator_id,
        payout_run_id: runId,
      },
    });
  } catch (transferErr) {
    await admin
      .from('creator_wallets')
      .update({
        available_cents: wallet.available_cents,
        pending_cents: wallet.pending_cents,
      })
      .eq('id', wallet.id);
    await admin.from('wallet_ledger').insert({
      company_id: wallet.company_id,
      creator_id: wallet.creator_id,
      kind: 'payout_failed',
      amount_cents: amountCents,
      payout_id: payout.id,
      note: transferErr instanceof Error ? transferErr.message : 'Transfer failed',
    });
    await admin
      .from('payouts')
      .update({ status: 'failed', completed_at: new Date().toISOString() })
      .eq('id', payout.id);
    throw transferErr;
  }

  const { error: updError } = await admin
    .from('payouts')
    .update({
      stripe_transfer_id: transfer.id,
      status: 'processing',
    })
    .eq('id', payout.id);
  if (updError) throw updError;

  return { payout_id: payout.id, transfer_id: transfer.id };
}

async function processCompany(
  admin: ReturnType<typeof adminClient>,
  stripe: Stripe,
  companyId: string,
  periodEnd: string,
  periodStart: string,
): Promise<Record<string, unknown>> {
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
    .select('*')
    .maybeSingle();

  if (claimError) {
    // Unique violation → already claimed for this Sunday.
    if (claimError.code === '23505') {
      return { company_id: companyId, skipped: true, reason: 'already claimed' };
    }
    throw claimError;
  }
  if (!run) {
    return { company_id: companyId, skipped: true, reason: 'already claimed' };
  }

  // Prepaid model: platform balance is funded by company credit top-ups.
  // Sunday job only Transfers creator available_cents → Connect (no ACH charge).
  const { data: wallets, error: walletsError } = await admin
    .from('creator_wallets')
    .select('id, company_id, creator_id, available_cents, pending_cents, stripe_connect_account_id')
    .eq('company_id', companyId)
    .gt('available_cents', 0)
    .not('stripe_connect_account_id', 'is', null);
  if (walletsError) throw walletsError;

  const toPay: WalletRow[] = [];
  for (const w of wallets ?? []) {
    const accountId = w.stripe_connect_account_id as string;
    try {
      const account = await stripe.accounts.retrieve(accountId);
      if (!account.payouts_enabled) continue;
      toPay.push(w as WalletRow);
    } catch {
      // Skip creators whose Connect account cannot be retrieved.
    }
  }

  toPay.sort((a, b) => b.available_cents - a.available_cents);

  const totalCents = toPay.reduce((sum, w) => sum + w.available_cents, 0);
  if (totalCents <= 0) {
    await admin
      .from('company_payout_runs')
      .update({
        status: 'transferred',
        charged_cents: 0,
        creators_paid: 0,
        error: 'skipped',
      })
      .eq('id', run.id);
    return { company_id: companyId, skipped: true, reason: 'nothing to pay', run_id: run.id };
  }

  let creatorsPaid = 0;
  const transferErrors: string[] = [];
  for (const w of toPay) {
    try {
      await payCreator(admin, stripe, w, w.available_cents, run.id);
      creatorsPaid += 1;
    } catch (e) {
      transferErrors.push(
        `${w.creator_id}: ${e instanceof Error ? e.message : 'transfer failed'}`,
      );
    }
  }

  await admin
    .from('company_payout_runs')
    .update({
      status: transferErrors.length && creatorsPaid === 0 ? 'failed' : 'transferred',
      charged_cents: totalCents,
      creators_paid: creatorsPaid,
      error: transferErrors.length ? transferErrors.join('; ').slice(0, 2000) : null,
    })
    .eq('id', run.id);

  return {
    company_id: companyId,
    run_id: run.id,
    transferred_cents: totalCents,
    creators_paid: creatorsPaid,
    transfer_errors: transferErrors.length ? transferErrors : undefined,
  };
}

Deno.serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;

  try {
    const admin = adminClient();
    const caller = await authenticate(req, admin);
    if (!caller) return jsonResponse({ error: 'unauthorized' }, 401);
    if (caller.kind === 'user' && caller.role !== 'campaign_manager') {
      return jsonResponse({ error: 'forbidden' }, 403);
    }

    const body = (await req.json().catch(() => ({}))) as {
      force?: boolean;
      company_id?: string;
    };

    const ny = getNyParts();
    const isPayoutWindow = ny.weekday === 'Sun' && ny.hour === 20;
    if (!isPayoutWindow && body.force !== true) {
      return jsonResponse({
        skipped: true,
        reason: 'outside Sunday 20:00–20:59 America/New_York',
        ny_weekday: ny.weekday,
        ny_hour: ny.hour,
        ny_date: ny.date,
      });
    }

    const periodEnd = ny.date;
    const periodStart = addDays(periodEnd, -6);

    let companyIds: string[];
    if (caller.kind === 'user' && body.company_id) {
      if (body.company_id !== caller.companyId) {
        return jsonResponse({ error: 'forbidden' }, 403);
      }
      companyIds = [body.company_id];
    } else if (caller.kind === 'user') {
      companyIds = [caller.companyId];
    } else {
      const { data: rows, error } = await admin
        .from('creator_wallets')
        .select('company_id')
        .gt('available_cents', 0)
        .not('stripe_connect_account_id', 'is', null);
      if (error) throw error;
      companyIds = [...new Set((rows ?? []).map((r) => r.company_id as string))];
    }

    const stripe = stripeClient();
    const results: Record<string, unknown>[] = [];
    for (const companyId of companyIds) {
      const { data: company, error: companyError } = await admin
        .from('companies')
        .select('payouts_enabled')
        .eq('id', companyId)
        .maybeSingle();
      if (companyError) throw companyError;
      if (company?.payouts_enabled !== true) {
        console.log(`weekly-payouts: payouts disabled for company ${companyId}, skipping`);
        results.push({ company_id: companyId, skipped: true, reason: 'payouts disabled' });
        continue;
      }
      results.push(await processCompany(admin, stripe, companyId, periodEnd, periodStart));
    }

    return jsonResponse({
      period_start: periodStart,
      period_end: periodEnd,
      companies: results.length,
      results,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'weekly-payouts failed';
    console.error('weekly-payouts', message);
    return jsonResponse({ error: message }, 500);
  }
});
