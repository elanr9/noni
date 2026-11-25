// budget-billing: the monthly creator budget, and the plan link ops sends
// after the call.
//
// Cron (x-cron-secret, every 15 minutes, migration 157): for every company
// whose budget_next_invoice_at has come round, bills that month's creator
// budget. Leftover rolls over: what is billed is the agreed budget minus
// what is still on the balance, minus any earlier budget bill not paid yet.
// A company with nothing to top up gets a "skipped" row and no bill. The
// bill is charged to the card saved at checkout; without one, Stripe emails
// an invoice due in 7 days. The paid invoice (metadata kind "budget") is
// credited to the balance by the noni-web Stripe webhook.
//
// Platform ops (user JWT):
//   { action: "bill_now", company_id }   bill this month now
//   { action: "send_offer", company_id, lines: string[] }
//                                       email the admin the link to start
//                                       the plan agreed on the call
//
// Safe to repeat: one company_budget_invoices row per company per period,
// the period is claimed by moving budget_next_invoice_at forward with a
// compare-and-set, and Stripe calls carry idempotency keys.

import Stripe from 'npm:stripe@17';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { adminClient, authenticate, handleCors, jsonResponse } from '../_shared/wp8.ts';
import { sendEmail } from '../_shared/email.ts';
import { budgetTopUp, nextPeriod } from '../_shared/budget.ts';

const WEB_URL = 'https://www.usenoni.app';
const BILLABLE = new Set(['active', 'trialing']);
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

type BillingRow = {
  company_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  credit_balance_cents: number;
  monthly_budget_cents: number;
  subscription_status: string;
  billing_simulated: boolean;
  budget_next_invoice_at: string | null;
};

const BILLING_COLUMNS =
  'company_id, stripe_customer_id, stripe_subscription_id, credit_balance_cents, monthly_budget_cents, subscription_status, billing_simulated, budget_next_invoice_at';

function stripeClient(): Stripe {
  const key = Deno.env.get('STRIPE_SECRET_KEY');
  if (!key) throw new Error('STRIPE_SECRET_KEY not set');
  return new Stripe(key);
}

const dollars = (cents: number) =>
  `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;

async function companyAdminEmail(admin: SupabaseClient, companyId: string): Promise<{ email: string | null; name: string }> {
  const { data: member } = await admin
    .from('company_members')
    .select('profile_id')
    .eq('company_id', companyId)
    .eq('role', 'company_admin')
    .is('removed_at', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!member) return { email: null, name: '' };
  const [{ data: auth }, { data: profile }] = await Promise.all([
    admin.auth.admin.getUserById(member.profile_id),
    admin.from('profiles').select('full_name').eq('id', member.profile_id).maybeSingle(),
  ]);
  return { email: auth.user?.email ?? null, name: String(profile?.full_name ?? '') };
}

/** The Stripe customer, made on first need, with the card from the plan
    checkout set as its default so budget bills charge it. */
async function ensureCustomer(
  admin: SupabaseClient,
  stripe: Stripe,
  row: BillingRow,
): Promise<{ id: string; card: boolean }> {
  let id = row.stripe_customer_id?.startsWith('cus_') ? row.stripe_customer_id : null;
  if (!id) {
    const [{ data: company }, who] = await Promise.all([
      admin.from('companies').select('name').eq('id', row.company_id).maybeSingle(),
      companyAdminEmail(admin, row.company_id),
    ]);
    if (!who.email) throw new Error('This company has no admin to bill.');
    const customer = await stripe.customers.create(
      { name: company?.name ?? undefined, email: who.email, metadata: { company_id: row.company_id } },
      { idempotencyKey: `budget-customer-${row.company_id}` },
    );
    id = customer.id;
    await admin.from('company_billing').update({ stripe_customer_id: id }).eq('company_id', row.company_id);
  }

  const customer = await stripe.customers.retrieve(id);
  if ('deleted' in customer && customer.deleted) throw new Error('The Stripe customer was deleted.');
  if (customer.invoice_settings?.default_payment_method) return { id, card: true };

  /* Checkout saves the card on the subscription; lift it to the customer. */
  const subId = row.stripe_subscription_id?.startsWith('sub_') ? row.stripe_subscription_id : null;
  if (subId) {
    const sub = await stripe.subscriptions.retrieve(subId);
    const pm = typeof sub.default_payment_method === 'string' ? sub.default_payment_method : sub.default_payment_method?.id;
    if (pm) {
      await stripe.customers.update(id, { invoice_settings: { default_payment_method: pm } });
      return { id, card: true };
    }
  }
  return { id, card: false };
}

type Outcome = { company_id: string; period: string; status: string; amount_cents?: number; error?: string };

/** Bills one period for one company. The period row is the lock: a second
    run for the same period finds it and stops, unless it failed before. */
async function billPeriod(admin: SupabaseClient, stripe: Stripe, row: BillingRow, period: string): Promise<Outcome> {
  const budget = row.monthly_budget_cents;
  const { data: existing } = await admin
    .from('company_budget_invoices')
    .select('id, status, updated_at')
    .eq('company_id', row.company_id)
    .eq('period_start', period)
    .maybeSingle();
  /* A failed bill is retried; so is one a crashed run left half made (the
     Stripe idempotency keys stop it billing twice). */
  const stale = existing?.status === 'billing' && Date.parse(existing.updated_at) < Date.now() - 30 * 60_000;
  if (existing && existing.status !== 'failed' && !stale) {
    return { company_id: row.company_id, period, status: `already ${existing.status}` };
  }

  const { data: open } = await admin
    .from('company_budget_invoices')
    .select('amount_cents')
    .eq('company_id', row.company_id)
    .eq('status', 'open')
    .neq('period_start', period);
  const unpaid = (open ?? []).reduce((n, r) => n + (r.amount_cents ?? 0), 0);
  const leftover = Math.max(0, row.credit_balance_cents);
  const amount = budgetTopUp(budget, leftover, unpaid);

  const base = {
    company_id: row.company_id,
    period_start: period,
    budget_cents: budget,
    leftover_cents: leftover,
    amount_cents: amount,
    updated_at: new Date().toISOString(),
  };

  if (amount === 0) {
    await admin
      .from('company_budget_invoices')
      .upsert({ ...base, status: 'skipped', error: null }, { onConflict: 'company_id,period_start' });
    return { company_id: row.company_id, period, status: 'skipped', amount_cents: 0 };
  }

  const { error: claimError } = await admin
    .from('company_budget_invoices')
    .upsert({ ...base, status: 'billing', error: null }, { onConflict: 'company_id,period_start' });
  if (claimError) throw claimError;

  try {
    const customer = await ensureCustomer(admin, stripe, row);
    const d = new Date(`${period}T00:00:00Z`);
    const month = `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
    const carried = leftover + unpaid;
    const description = carried > 0
      ? `Noni creator budget for ${month}: ${dollars(budget)} budget, ${dollars(carried)} carried over.`
      : `Noni creator budget for ${month}.`;
    const metadata = { company_id: row.company_id, kind: 'budget', period };
    const key = `budget-${row.company_id}-${period}-${amount}`;

    const invoice = await stripe.invoices.create(
      {
        customer: customer.id,
        collection_method: customer.card ? 'charge_automatically' : 'send_invoice',
        ...(customer.card ? {} : { days_until_due: 7 }),
        auto_advance: true,
        pending_invoice_items_behavior: 'exclude',
        description,
        metadata,
      },
      { idempotencyKey: `${key}-invoice` },
    );
    if (!invoice.id) throw new Error('Stripe did not create the invoice.');
    if (invoice.status === 'draft') {
      await stripe.invoiceItems.create(
        {
          customer: customer.id,
          invoice: invoice.id,
          amount,
          currency: 'usd',
          description: `Creator budget, ${month}`,
          metadata,
        },
        { idempotencyKey: `${key}-item` },
      );
      await stripe.invoices.finalizeInvoice(invoice.id, { auto_advance: true });
    }

    let status: 'open' | 'paid' = 'open';
    if (customer.card) {
      try {
        const paid = await stripe.invoices.pay(invoice.id);
        if (paid.status === 'paid') status = 'paid';
      } catch (e) {
        /* Declined: the invoice stays open and Stripe retries the card. */
        console.warn('budget-billing charge', row.company_id, e instanceof Error ? e.message : e);
      }
    } else {
      await stripe.invoices.sendInvoice(invoice.id);
    }

    /* The webhook may have marked it paid already; never move it back. */
    await admin
      .from('company_budget_invoices')
      .update({ stripe_invoice_id: invoice.id, updated_at: new Date().toISOString() })
      .eq('company_id', row.company_id)
      .eq('period_start', period);
    await admin
      .from('company_budget_invoices')
      .update({ status })
      .eq('company_id', row.company_id)
      .eq('period_start', period)
      .eq('status', 'billing');
    return { company_id: row.company_id, period, status, amount_cents: amount };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await admin
      .from('company_budget_invoices')
      .update({ status: 'failed', error: message.slice(0, 500), updated_at: new Date().toISOString() })
      .eq('company_id', row.company_id)
      .eq('period_start', period);
    return { company_id: row.company_id, period, status: 'failed', error: message };
  }
}

/** Claims the company's current period by moving its next date a month on,
    then bills it. A run that loses the race does nothing. */
async function billDue(admin: SupabaseClient, stripe: Stripe, row: BillingRow): Promise<Outcome | null> {
  const at = row.budget_next_invoice_at;
  if (!at) return null;
  if (row.monthly_budget_cents <= 0 || !BILLABLE.has(row.subscription_status) || row.billing_simulated) {
    /* Nothing to bill now: hold the date so it bills once it applies. */
    return null;
  }
  const { data: first } = await admin
    .from('company_budget_invoices')
    .select('period_start')
    .eq('company_id', row.company_id)
    .order('period_start', { ascending: true })
    .limit(1)
    .maybeSingle();
  const anchorDay = first ? new Date(`${first.period_start}T00:00:00Z`).getUTCDate() : new Date(at).getUTCDate();

  const { data: claimed } = await admin
    .from('company_billing')
    .update({ budget_next_invoice_at: nextPeriod(at, anchorDay) })
    .eq('company_id', row.company_id)
    .eq('budget_next_invoice_at', at)
    .select('company_id');
  if (!claimed?.length) return null;
  return billPeriod(admin, stripe, row, at.slice(0, 10));
}

async function runCron(admin: SupabaseClient): Promise<Outcome[]> {
  const stripe = stripeClient();
  const out: Outcome[] = [];

  const { data: due, error } = await admin
    .from('company_billing')
    .select(BILLING_COLUMNS)
    .lte('budget_next_invoice_at', new Date().toISOString())
    .gt('monthly_budget_cents', 0)
    .in('subscription_status', [...BILLABLE])
    .eq('billing_simulated', false)
    .limit(200);
  if (error) throw error;
  for (const row of (due ?? []) as BillingRow[]) {
    const r = await billDue(admin, stripe, row);
    if (r) out.push(r);
  }

  /* Bills Stripe refused (or a crashed run left) in the last 30 days get another go. */
  const since = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
  const { data: failed } = await admin
    .from('company_budget_invoices')
    .select('company_id, period_start')
    .or(`status.eq.failed,and(status.eq.billing,updated_at.lt.${new Date(Date.now() - 30 * 60_000).toISOString()})`)
    .gte('period_start', since)
    .limit(100);
  for (const f of failed ?? []) {
    const { data: row } = await admin.from('company_billing').select(BILLING_COLUMNS).eq('company_id', f.company_id).maybeSingle();
    const r = row as BillingRow | null;
    if (!r || r.monthly_budget_cents <= 0 || !BILLABLE.has(r.subscription_status) || r.billing_simulated) continue;
    out.push(await billPeriod(admin, stripe, r, f.period_start));
  }
  return out;
}

Deno.serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;

  try {
    const admin = adminClient();
    const caller = await authenticate(req, admin);
    if (!caller) return jsonResponse({ error: 'unauthorized' }, 401);

    if (caller.kind === 'cron') {
      const results = await runCron(admin);
      return jsonResponse({ ok: true, results });
    }
    if (!caller.platformAdmin) return jsonResponse({ error: 'forbidden' }, 403);

    const body = (await req.json().catch(() => null)) as
      | { action?: string; company_id?: string; lines?: unknown }
      | null;
    const companyId = body?.company_id;
    if (!companyId) return jsonResponse({ error: 'company_id is required' }, 400);

    if (body?.action === 'send_offer') {
      const lines = Array.isArray(body.lines) ? body.lines.map(String).filter(Boolean).slice(0, 4) : [];
      const who = await companyAdminEmail(admin, companyId);
      if (!who.email) return jsonResponse({ error: 'This company has no admin to email yet.' }, 400);
      const first = who.name.trim().split(/\s+/)[0];
      await sendEmail({
        to: who.email,
        subject: 'Your Noni plan',
        content: {
          preview: lines[0] ?? 'Start your plan',
          heading: first ? `${first}, your plan is ready` : 'Your plan is ready',
          paragraphs: lines,
          cta: { label: 'Start subscription', url: `${WEB_URL}/start` },
        },
      });
      await admin
        .from('company_billing')
        .update({ offer_sent_at: new Date().toISOString() })
        .eq('company_id', companyId);
      return jsonResponse({ ok: true, email: who.email });
    }

    if (body?.action === 'bill_now') {
      const { data } = await admin.from('company_billing').select(BILLING_COLUMNS).eq('company_id', companyId).maybeSingle();
      const row = data as BillingRow | null;
      if (!row) return jsonResponse({ error: 'No billing for this company yet.' }, 400);
      if (row.monthly_budget_cents <= 0) return jsonResponse({ error: 'Set a monthly creator budget first.' }, 400);
      if (!BILLABLE.has(row.subscription_status)) return jsonResponse({ error: 'The company has no active plan yet.' }, 400);
      if (row.billing_simulated) return jsonResponse({ error: 'This company is in test mode. Add credits from the Test mode tab.' }, 400);
      /* Bring the date to now; the period it starts is billed right away. */
      const now = new Date().toISOString();
      await admin.from('company_billing').update({ budget_next_invoice_at: now }).eq('company_id', companyId);
      const result = await billDue(admin, stripeClient(), { ...row, budget_next_invoice_at: now });
      if (result?.status === 'failed') return jsonResponse({ error: result.error ?? 'Stripe refused the bill.' }, 502);
      return jsonResponse({ ok: true, result });
    }

    return jsonResponse({ error: 'unknown action' }, 400);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'budget-billing failed';
    console.error('budget-billing', message);
    return jsonResponse({ error: message }, 500);
  }
});
