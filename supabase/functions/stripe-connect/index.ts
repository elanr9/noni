import { createClient } from 'npm:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@17';
import { handleCors, jsonResponse } from '../_shared/wp8.ts';

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

async function requireCreator(req: Request) {
  const admin = adminClient();
  const authHeader = req.headers.get('Authorization') ?? '';
  const { data: userData } = await admin.auth.getUser(
    authHeader.replace('Bearer ', ''),
  );
  if (!userData?.user) return { error: jsonResponse({ error: 'unauthorized' }, 401) };

  const { data: profile } = await admin
    .from('profiles')
    .select('id, company_id, role, full_name')
    .eq('id', userData.user.id)
    .maybeSingle();
  if (!profile || profile.role !== 'creator') {
    return { error: jsonResponse({ error: 'forbidden' }, 403) };
  }
  return {
    admin,
    stripe: stripeClient(),
    profile,
    email: userData.user.email ?? undefined,
  };
}

async function ensureWallet(
  admin: ReturnType<typeof createClient>,
  companyId: string,
  creatorId: string,
) {
  const { data: existing } = await admin
    .from('creator_wallets')
    .select('*')
    .eq('company_id', companyId)
    .eq('creator_id', creatorId)
    .maybeSingle();
  if (existing) return existing;

  const { data, error } = await admin
    .from('creator_wallets')
    .insert({ company_id: companyId, creator_id: creatorId })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

async function accountFlags(stripe: Stripe, accountId: string) {
  const account = await stripe.accounts.retrieve(accountId);
  return {
    details_submitted: account.details_submitted === true,
    charges_enabled: account.charges_enabled === true,
    payouts_enabled: account.payouts_enabled === true,
    onboarded:
      account.details_submitted === true && account.payouts_enabled === true,
  };
}

Deno.serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;
  try {
    const body = (await req.json().catch(() => null)) as {
      action?: 'status' | 'onboard_url';
    } | null;
    const action = body?.action;
    if (action !== 'status' && action !== 'onboard_url') {
      return jsonResponse({ error: 'expected { action }' }, 400);
    }

    const ctx = await requireCreator(req);
    if ('error' in ctx && ctx.error) return ctx.error;
    const { admin, stripe, profile, email } = ctx as Exclude<
      Awaited<ReturnType<typeof requireCreator>>,
      { error: Response }
    >;

    const wallet = await ensureWallet(admin, profile.company_id, profile.id);
    let accountId = wallet.stripe_connect_account_id as string | null;

    if (!accountId) {
      if (action === 'status') {
        return jsonResponse({
          account_id: null,
          onboarded: false,
          details_submitted: false,
          charges_enabled: false,
          payouts_enabled: false,
        });
      }
      const account = await stripe.accounts.create({
        type: 'express',
        country: 'US',
        email,
        capabilities: {
          transfers: { requested: true },
        },
        business_type: 'individual',
        metadata: {
          company_id: profile.company_id,
          creator_id: profile.id,
        },
      });
      accountId = account.id;
      const { error } = await admin
        .from('creator_wallets')
        .update({ stripe_connect_account_id: accountId })
        .eq('id', wallet.id);
      if (error) throw error;
    }

    const flags = await accountFlags(stripe, accountId);

    if (action === 'status') {
      return jsonResponse({
        account_id: accountId,
        ...flags,
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    if (!supabaseUrl) throw new Error('SUPABASE_URL missing');
    const returnBase = `${supabaseUrl}/functions/v1/connect-return`;
    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${returnBase}?connect=refresh`,
      return_url: `${returnBase}?connect=return`,
      type: 'account_onboarding',
    });
    return jsonResponse({ url: link.url, account_id: accountId, ...flags });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown error';
    return jsonResponse({ error: message }, 500);
  }
});
