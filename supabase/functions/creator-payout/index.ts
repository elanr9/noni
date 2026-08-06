import { createClient } from 'npm:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@17';
import { handleCors, jsonResponse } from '../_shared/wp8.ts';

function stripeClient(): Stripe {
  const key = Deno.env.get('STRIPE_SECRET_KEY');
  if (!key) throw new Error('STRIPE_SECRET_KEY missing');
  return new Stripe(key);
}

Deno.serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;
  try {
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const stripe = stripeClient();

    const authHeader = req.headers.get('Authorization') ?? '';
    const { data: userData } = await admin.auth.getUser(
      authHeader.replace('Bearer ', ''),
    );
    if (!userData?.user) return jsonResponse({ error: 'unauthorized' }, 401);

    const { data: profile } = await admin
      .from('profiles')
      .select('id, company_id, role')
      .eq('id', userData.user.id)
      .maybeSingle();
    if (!profile || profile.role !== 'creator') {
      return jsonResponse({ error: 'forbidden' }, 403);
    }

    const { data: wallet } = await admin
      .from('creator_wallets')
      .select('*')
      .eq('company_id', profile.company_id)
      .eq('creator_id', profile.id)
      .maybeSingle();
    if (!wallet) {
      return jsonResponse({ error: 'wallet not found — open Balance first' }, 400);
    }
    if (!wallet.stripe_connect_account_id) {
      return jsonResponse({ error: 'Connect Stripe first' }, 400);
    }
    if (wallet.available_cents <= 0) {
      return jsonResponse({ error: 'Nothing available to cash out' }, 400);
    }

    const account = await stripe.accounts.retrieve(wallet.stripe_connect_account_id);
    if (!account.payouts_enabled) {
      return jsonResponse({ error: 'Finish Stripe Connect onboarding first' }, 400);
    }

    const amountCents = wallet.available_cents as number;

    const { data: payout, error: payoutError } = await admin
      .from('payouts')
      .insert({
        company_id: profile.company_id,
        creator_id: profile.id,
        amount_cents: amountCents,
        status: 'pending',
      })
      .select('*')
      .single();
    if (payoutError) throw payoutError;

    const { error: holdError } = await admin.from('wallet_ledger').insert({
      company_id: profile.company_id,
      creator_id: profile.id,
      kind: 'payout_hold',
      amount_cents: -amountCents,
      payout_id: payout.id,
      note: 'Cash out hold',
    });
    if (holdError) throw holdError;

    const { data: held, error: balError } = await admin
      .from('creator_wallets')
      .update({
        available_cents: 0,
        pending_cents: wallet.pending_cents + amountCents,
      })
      .eq('id', wallet.id)
      .eq('available_cents', amountCents)
      .select('id');
    if (balError) throw balError;
    if (!held?.length) {
      await admin.from('wallet_ledger').delete().eq('payout_id', payout.id);
      await admin.from('payouts').delete().eq('id', payout.id);
      return jsonResponse({ error: 'Balance changed — try again' }, 409);
    }

    let transfer: Stripe.Transfer;
    try {
      transfer = await stripe.transfers.create({
        amount: amountCents,
        currency: 'usd',
        destination: wallet.stripe_connect_account_id,
        metadata: {
          payout_id: payout.id,
          company_id: profile.company_id,
          creator_id: profile.id,
        },
      });
    } catch (transferErr) {
      await admin
        .from('creator_wallets')
        .update({
          available_cents: amountCents,
          pending_cents: wallet.pending_cents,
        })
        .eq('id', wallet.id);
      await admin.from('wallet_ledger').insert({
        company_id: profile.company_id,
        creator_id: profile.id,
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

    return jsonResponse({
      payout_id: payout.id,
      amount_cents: amountCents,
      transfer_id: transfer.id,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown error';
    return jsonResponse({ error: message }, 500);
  }
});
