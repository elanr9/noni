import Stripe from 'npm:stripe@17';
import {
  adminClient,
  authenticate,
  handleCors,
  hasPermission,
  jsonResponse,
} from '../_shared/wp8.ts';

const MAX_MONTHLY_BUDGET_CENTS = 10_000_000; // $100,000
const MIN_TOPUP_CENTS = 1000; // $10

function stripeClient(): Stripe {
  const key = Deno.env.get('STRIPE_SECRET_KEY');
  if (!key) throw new Error('STRIPE_SECRET_KEY missing');
  return new Stripe(key);
}

type BillingRow = {
  company_id: string;
  stripe_customer_id: string | null;
  stripe_payment_method_id: string | null;
  bank_last4: string | null;
  bank_name: string | null;
  payouts_enabled: boolean;
  weekly_budget_cents: number;
  monthly_budget_cents: number;
  credit_balance_cents: number;
  updated_at: string;
};

async function ensureBilling(
  admin: ReturnType<typeof adminClient>,
  companyId: string,
): Promise<BillingRow> {
  const { data: existing } = await admin
    .from('company_billing')
    .select('*')
    .eq('company_id', companyId)
    .maybeSingle();
  if (existing) return existing as BillingRow;

  const { data, error } = await admin
    .from('company_billing')
    .insert({ company_id: companyId })
    .select('*')
    .single();
  if (error) throw error;
  return data as BillingRow;
}

async function ensureCustomer(
  admin: ReturnType<typeof adminClient>,
  stripe: Stripe,
  companyId: string,
  billing: BillingRow,
): Promise<string> {
  if (billing.stripe_customer_id) return billing.stripe_customer_id;

  const { data: company } = await admin
    .from('companies')
    .select('name')
    .eq('id', companyId)
    .maybeSingle();

  const customer = await stripe.customers.create({
    name: company?.name ?? undefined,
    metadata: { company_id: companyId, purpose: 'company_billing' },
  });
  const { error } = await admin
    .from('company_billing')
    .update({
      stripe_customer_id: customer.id,
      updated_at: new Date().toISOString(),
    })
    .eq('company_id', companyId);
  if (error) throw error;
  return customer.id;
}

Deno.serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;

  try {
    const admin = adminClient();
    const caller = await authenticate(req, admin);
    if (!caller || caller.kind !== 'user') {
      return jsonResponse({ error: 'unauthorized' }, 401);
    }
    if (!(await hasPermission(admin, caller, 'manage_billing'))) {
      return jsonResponse({ error: 'forbidden' }, 403);
    }

    const body = (await req.json().catch(() => null)) as {
      action?: 'status' | 'setup_url' | 'set_budget' | 'topup_url';
      monthly_budget_cents?: number;
      weekly_budget_cents?: number;
      amount_cents?: number;
    } | null;
    const action = body?.action;
    if (
      action !== 'status' &&
      action !== 'setup_url' &&
      action !== 'set_budget' &&
      action !== 'topup_url'
    ) {
      return jsonResponse({ error: 'expected { action }' }, 400);
    }

    const companyId = caller.companyId;
    const billing = await ensureBilling(admin, companyId);
    const bankConnected =
      typeof billing.stripe_payment_method_id === 'string' &&
      billing.stripe_payment_method_id.length > 0 &&
      billing.payouts_enabled === true;

    if (action === 'status') {
      return jsonResponse({
        company_id: billing.company_id,
        stripe_customer_id: billing.stripe_customer_id,
        stripe_payment_method_id: billing.stripe_payment_method_id,
        bank_last4: billing.bank_last4,
        bank_name: billing.bank_name,
        payouts_enabled: billing.payouts_enabled,
        weekly_budget_cents: billing.weekly_budget_cents,
        monthly_budget_cents: billing.monthly_budget_cents,
        credit_balance_cents: billing.credit_balance_cents,
        bank_connected: bankConnected,
        updated_at: billing.updated_at,
      });
    }

    if (action === 'set_budget') {
      const cents =
        typeof body?.monthly_budget_cents === 'number'
          ? body.monthly_budget_cents
          : body?.weekly_budget_cents;
      if (typeof cents !== 'number' || !Number.isInteger(cents) || cents < 0) {
        return jsonResponse({ error: 'monthly_budget_cents must be a non-negative integer' }, 400);
      }
      if (cents > MAX_MONTHLY_BUDGET_CENTS) {
        return jsonResponse({
          error: `monthly_budget_cents exceeds max ${MAX_MONTHLY_BUDGET_CENTS}`,
        }, 400);
      }
      const { data, error } = await admin
        .from('company_billing')
        .update({
          monthly_budget_cents: cents,
          weekly_budget_cents: Math.floor(cents / 4),
          updated_at: new Date().toISOString(),
        })
        .eq('company_id', companyId)
        .select('*')
        .single();
      if (error) throw error;
      return jsonResponse({
        monthly_budget_cents: data.monthly_budget_cents,
        weekly_budget_cents: data.weekly_budget_cents,
        credit_balance_cents: data.credit_balance_cents,
        bank_connected: bankConnected,
        warn: null,
      });
    }

    const stripe = stripeClient();
    const customerId = await ensureCustomer(admin, stripe, companyId, billing);
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    if (!supabaseUrl) throw new Error('SUPABASE_URL missing');
    const returnBase = `${supabaseUrl}/functions/v1/connect-return`;

    if (action === 'topup_url') {
      const amountCents = body?.amount_cents;
      if (
        typeof amountCents !== 'number' ||
        !Number.isInteger(amountCents) ||
        amountCents < MIN_TOPUP_CENTS
      ) {
        return jsonResponse({
          error: `amount_cents must be an integer >= ${MIN_TOPUP_CENTS}`,
        }, 400);
      }

      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        customer: customerId,
        line_items: [
          {
            price_data: {
              currency: 'usd',
              unit_amount: amountCents,
              product_data: {
                name: 'Noni creator credits',
                description: `$${ (amountCents / 100).toFixed(2) } prepaid credits`,
              },
            },
            quantity: 1,
          },
        ],
        success_url: `${returnBase}?to=admin-billing`,
        cancel_url: `${returnBase}?to=admin-billing&billing=cancel`,
        metadata: {
          company_id: companyId,
          purpose: 'company_credit_topup',
          amount_cents: String(amountCents),
        },
        payment_intent_data: {
          metadata: {
            company_id: companyId,
            purpose: 'company_credit_topup',
            amount_cents: String(amountCents),
          },
        },
      });
      if (!session.url) throw new Error('Checkout session missing url');
      return jsonResponse({
        url: session.url,
        amount_cents: amountCents,
        stripe_customer_id: customerId,
      });
    }

    // setup_url — optional saved payment method
    const session = await stripe.checkout.sessions.create({
      mode: 'setup',
      customer: customerId,
      payment_method_types: ['card', 'us_bank_account'],
      success_url: `${returnBase}?to=admin-billing`,
      cancel_url: `${returnBase}?to=admin-billing&billing=cancel`,
      metadata: {
        company_id: companyId,
        purpose: 'company_billing_setup',
      },
    });
    if (!session.url) throw new Error('Checkout session missing url');
    return jsonResponse({
      url: session.url,
      stripe_customer_id: customerId,
      bank_connected: bankConnected,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown error';
    return jsonResponse({ error: message }, 500);
  }
});
