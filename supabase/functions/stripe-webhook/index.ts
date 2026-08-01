import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@17';

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function stripeClient(): Stripe {
  const key = Deno.env.get('STRIPE_SECRET_KEY');
  if (!key) throw new Error('STRIPE_SECRET_KEY missing');
  return new Stripe(key);
}

function adminClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

function collectCodes(session: Stripe.Checkout.Session): string[] {
  const codes = new Set<string>();
  const meta = session.metadata ?? {};
  for (const key of [
    'promo_code',
    'promotion_code',
    'attribution_code',
    'utm_campaign',
    'code',
  ]) {
    const v = meta[key];
    if (v) codes.add(v.trim());
  }
  if (session.client_reference_id) {
    codes.add(session.client_reference_id.trim());
  }
  const discounts = session.discounts ?? [];
  for (const d of discounts) {
    if (typeof d.promotion_code === 'string') {
      codes.add(d.promotion_code);
    } else if (d.promotion_code && typeof d.promotion_code === 'object') {
      const promo = d.promotion_code as Stripe.PromotionCode;
      if (promo.code) codes.add(promo.code);
    }
  }
  return [...codes].filter((c) => c.length > 0);
}

async function resolvePromoCodes(
  stripe: Stripe,
  session: Stripe.Checkout.Session,
): Promise<string[]> {
  const codes = collectCodes(session);
  // Expand promotion codes from discount IDs when only IDs are present.
  const full = await stripe.checkout.sessions.retrieve(session.id, {
    expand: ['total_details.breakdown.discounts.discount.promotion_code'],
  });
  for (const d of full.discounts ?? []) {
    const promo = d.promotion_code;
    if (typeof promo === 'string') {
      try {
        const p = await stripe.promotionCodes.retrieve(promo);
        if (p.code) codes.push(p.code);
      } catch {
        // ignore
      }
    } else if (promo && typeof promo === 'object' && promo.code) {
      codes.push(promo.code);
    }
  }
  return [...new Set(codes.map((c) => c.trim()).filter(Boolean))];
}

async function handleCheckoutCompleted(
  admin: SupabaseClient,
  stripe: Stripe,
  event: Stripe.Event,
) {
  const session = event.data.object as Stripe.Checkout.Session;
  const codes = await resolvePromoCodes(stripe, session);
  if (codes.length === 0) {
    return { skipped: true, reason: 'no attribution code on session' };
  }

  const { data: links } = await admin
    .from('attribution_links')
    .select('id, company_id, code, task_id')
    .in('code', codes);

  const link = links?.[0] ?? null;
  if (!link) {
    return { skipped: true, reason: `no attribution_link for codes: ${codes.join(',')}` };
  }

  const amountCents = session.amount_total ?? 0;
  const { error } = await admin.from('revenue_events').upsert(
    {
      company_id: link.company_id,
      attribution_link_id: link.id,
      stripe_event_id: event.id,
      amount_cents: amountCents,
      occurred_at: new Date((session.created ?? Date.now() / 1000) * 1000).toISOString(),
    },
    { onConflict: 'stripe_event_id' },
  );
  if (error) throw error;
  return {
    ok: true,
    attribution_link_id: link.id,
    task_id: link.task_id,
    amount_cents: amountCents,
  };
}

async function findPayout(
  admin: SupabaseClient,
  transfer: Stripe.Transfer,
) {
  const payoutId = transfer.metadata?.payout_id;
  if (payoutId) {
    const { data } = await admin
      .from('payouts')
      .select('*')
      .eq('id', payoutId)
      .maybeSingle();
    if (data) return data;
  }
  const { data } = await admin
    .from('payouts')
    .select('*')
    .eq('stripe_transfer_id', transfer.id)
    .maybeSingle();
  return data;
}

async function markPayoutPaid(
  admin: SupabaseClient,
  payout: {
    id: string;
    company_id: string;
    creator_id: string;
    amount_cents: number;
    status: string;
  },
  transferId: string,
) {
  if (payout.status === 'paid') return { ok: true, already: true };

  const { data: wallet } = await admin
    .from('creator_wallets')
    .select('*')
    .eq('company_id', payout.company_id)
    .eq('creator_id', payout.creator_id)
    .maybeSingle();
  if (!wallet) throw new Error('wallet missing for payout');

  const nextPending = Math.max(0, wallet.pending_cents - payout.amount_cents);
  const { error: balError } = await admin
    .from('creator_wallets')
    .update({ pending_cents: nextPending })
    .eq('id', wallet.id);
  if (balError) throw balError;

  await admin.from('wallet_ledger').insert({
    company_id: payout.company_id,
    creator_id: payout.creator_id,
    kind: 'payout_paid',
    amount_cents: -payout.amount_cents,
    payout_id: payout.id,
    note: `Transfer ${transferId}`,
  });

  const { error } = await admin
    .from('payouts')
    .update({
      status: 'paid',
      stripe_transfer_id: transferId,
      completed_at: new Date().toISOString(),
    })
    .eq('id', payout.id);
  if (error) throw error;
  return { ok: true };
}

async function markPayoutFailed(
  admin: SupabaseClient,
  payout: {
    id: string;
    company_id: string;
    creator_id: string;
    amount_cents: number;
    status: string;
  },
  reason: string,
) {
  if (payout.status === 'failed' || payout.status === 'paid') {
    return { ok: true, already: true };
  }

  const { data: wallet } = await admin
    .from('creator_wallets')
    .select('*')
    .eq('company_id', payout.company_id)
    .eq('creator_id', payout.creator_id)
    .maybeSingle();
  if (!wallet) throw new Error('wallet missing for payout');

  const { error: balError } = await admin
    .from('creator_wallets')
    .update({
      available_cents: wallet.available_cents + payout.amount_cents,
      pending_cents: Math.max(0, wallet.pending_cents - payout.amount_cents),
    })
    .eq('id', wallet.id);
  if (balError) throw balError;

  await admin.from('wallet_ledger').insert({
    company_id: payout.company_id,
    creator_id: payout.creator_id,
    kind: 'payout_failed',
    amount_cents: payout.amount_cents,
    payout_id: payout.id,
    note: reason,
  });

  const { error } = await admin
    .from('payouts')
    .update({
      status: 'failed',
      completed_at: new Date().toISOString(),
    })
    .eq('id', payout.id);
  if (error) throw error;
  return { ok: true };
}

async function handleTransferEvent(
  admin: SupabaseClient,
  event: Stripe.Event,
) {
  const transfer = event.data.object as Stripe.Transfer;
  const payout = await findPayout(admin, transfer);
  if (!payout) {
    return { skipped: true, reason: `no payout for transfer ${transfer.id}` };
  }

  if (event.type === 'transfer.reversed') {
    return await markPayoutFailed(admin, payout, `Transfer reversed ${transfer.id}`);
  }

  // transfer.created / transfer.updated — Treat as paid once created successfully.
  // Reversals are handled separately.
  if (payout.stripe_transfer_id == null) {
    await admin
      .from('payouts')
      .update({ stripe_transfer_id: transfer.id, status: 'processing' })
      .eq('id', payout.id);
  }

  if (event.type === 'transfer.created' || event.type === 'transfer.updated') {
    // If reversed amount equals amount, treat as failed; else paid.
    const reversed = transfer.reversed === true ||
      (transfer.amount_reversed ?? 0) >= transfer.amount;
    if (reversed) {
      return await markPayoutFailed(admin, payout, `Transfer reversed ${transfer.id}`);
    }
    return await markPayoutPaid(admin, payout, transfer.id);
  }

  return { skipped: true, reason: `unhandled transfer event ${event.type}` };
}

async function handleAccountUpdated(
  admin: SupabaseClient,
  event: Stripe.Event,
) {
  const account = event.data.object as Stripe.Account;
  const creatorId = account.metadata?.creator_id;
  if (!creatorId) return { skipped: true, reason: 'no creator_id metadata' };

  const { error } = await admin
    .from('creator_wallets')
    .update({ stripe_connect_account_id: account.id })
    .eq('creator_id', creatorId);
  if (error) throw error;
  return {
    ok: true,
    creator_id: creatorId,
    payouts_enabled: account.payouts_enabled === true,
  };
}

Deno.serve(async (req) => {
  const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  if (!secret) return jsonResponse({ error: 'STRIPE_WEBHOOK_SECRET missing' }, 500);

  const signature = req.headers.get('stripe-signature');
  if (!signature) return jsonResponse({ error: 'missing signature' }, 400);

  const rawBody = await req.text();
  const stripe = stripeClient();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, secret);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'bad signature';
    return jsonResponse({ error: message }, 400);
  }

  const admin = adminClient();
  try {
    let result: Record<string, unknown>;
    switch (event.type) {
      case 'checkout.session.completed':
        result = await handleCheckoutCompleted(admin, stripe, event);
        break;
      case 'transfer.created':
      case 'transfer.updated':
      case 'transfer.reversed':
        result = await handleTransferEvent(admin, event);
        break;
      case 'account.updated':
        result = await handleAccountUpdated(admin, event);
        break;
      default:
        result = { skipped: true, reason: `ignored ${event.type}` };
    }
    return jsonResponse({ received: true, type: event.type, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'handler error';
    console.error('stripe-webhook', event.type, message);
    return jsonResponse({ error: message }, 500);
  }
});
