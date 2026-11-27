// Fills conversion_daily (sign-ups, trials, sales per company per day) for
// the Analytics tab.
//
// Source 1, every company: the Stripe account the company connected on the
// web (company_billing.stripe_account_id, read-only Connect OAuth). Noni's
// platform key reads it with the Stripe-Account header:
//   new customers          -> new_accounts
//   subscriptions on trial -> free_trials
//   succeeded charges      -> sales_count, sales_cents (net of refunds)
// Each creator has a code (attribution_links.code, set on their profile in
// the app). A customer is that creator's when they paid an invoice or
// finished a Checkout with the Stripe promotion code of the same name, or
// when the customer's or charge's metadata carries it (referral_code, ref,
// noni_code, promo_code). Their sign-up, trial and sales then also count on
// the creator's row, which the app splits across that creator's posts.
//
// Source 2, one legacy company: the FieldVision product database, only when
// FIELDVISION_COMPANY_ID names the company outright and it has no Stripe
// account connected. It is never guessed from "the only company".
//
// AGGREGATES ONLY: customer and charge rows are read, counted in memory and
// discarded. Days are UTC.
//
// Cron (x-cron-secret) syncs every company; a campaign manager's call syncs
// their active company.
//
// Sign-ups: a company that connected its Supabase project (read-only OAuth,
// set up on the web) has them counted from its auth.users, hourly.
//
// Env: STRIPE_SECRET_KEY, NONI_SB_OAUTH_CLIENT_ID, NONI_SB_OAUTH_CLIENT_SECRET (function secrets cannot start with SUPABASE_);
// optional FIELDVISION_URL, FIELDVISION_SERVICE_KEY,
// FIELDVISION_COMPANY_ID.

import {
  adminClient,
  authenticate,
  handleCors,
  jsonResponse,
} from '../_shared/wp8.ts';
import { isManagerOf } from '../_shared/membership.ts';

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

const PAGE_SIZE = 1000;

type FvProfileRow = {
  user_id: string | null;
  created_at: string | null;
  trial_started_at: string | null;
};

type FvSubscriptionRow = {
  user_id: string | null;
  amount_cents: number | null;
  paid_at: string | null;
};

type FvIntakeRow = {
  user_id: string | null;
  referral_code: string | null;
};

type DayTotals = {
  new_accounts: number;
  free_trials: number;
  sales_count: number;
  sales_cents: number;
};

function emptyTotals(): DayTotals {
  return { new_accounts: 0, free_trials: 0, sales_count: 0, sales_cents: 0 };
}

function dayOf(timestamp: string): string {
  return timestamp.slice(0, 10);
}

function fieldVisionEnv(): { url: string; key: string } {
  const url = Deno.env.get('FIELDVISION_URL');
  const key = Deno.env.get('FIELDVISION_SERVICE_KEY');
  if (!url || !key) {
    throw new Error('FIELDVISION_URL / FIELDVISION_SERVICE_KEY missing');
  }
  return { url: url.replace(/\/$/, ''), key };
}

/** Paginated read from FieldVision PostgREST. `query` includes select+filters. */
async function fvRows<T>(query: string): Promise<T[]> {
  const { url, key } = fieldVisionEnv();
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const res = await fetch(`${url}/rest/v1/${query}`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Range: `${from}-${from + PAGE_SIZE - 1}`,
      },
    });
    if (!res.ok) {
      throw new Error(`fieldvision ${query.split('?')[0]}: ${res.status} ${await res.text()}`);
    }
    const batch = (await res.json()) as T[];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) return rows;
  }
}

// ————— FieldVision source (legacy, one company) —————

async function syncFieldVision(companyId: string, days: number): Promise<{ rows: number }> {
  const admin = adminClient();
  const windowStart = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  windowStart.setUTCHours(0, 0, 0, 0);
  const sinceIso = windowStart.toISOString();

  // Per-creator tracked links: attribution_links.code handed out by each
  // creator, matched against the referral_code FieldVision captures at signup.
  const { data: links, error: linksError } = await admin
    .from('attribution_links')
    .select('code, creator_id')
    .eq('company_id', companyId)
    .not('creator_id', 'is', null);
  if (linksError) throw linksError;
  const creatorByCode = new Map<string, string>();
  for (const link of links ?? []) {
    creatorByCode.set(
      (link.code as string).toLowerCase(),
      link.creator_id as string,
    );
  }

  const [profiles, subscriptions] = await Promise.all([
    fvRows<FvProfileRow>(
      `user_profiles?select=user_id,created_at,trial_started_at` +
        `&is_demo=not.is.true` +
        `&or=(created_at.gte.${sinceIso},trial_started_at.gte.${sinceIso})`,
    ),
    fvRows<FvSubscriptionRow>(
      `user_subscriptions?select=user_id,amount_cents,paid_at&paid_at=gte.${sinceIso}`,
    ),
  ]);

  // Code -> user mapping, only for codes that belong to this company's
  // creators. Nothing about unmatched users is read beyond this.
  const creatorByUser = new Map<string, string>();
  if (creatorByCode.size > 0) {
    const codeFilter = [...creatorByCode.keys()]
      .map((c) => `"${c.replace(/"/g, '')}"`)
      .join(',');
    const intake = await fvRows<FvIntakeRow>(
      `user_onboarding_intake?select=user_id,referral_code&referral_code=in.(${codeFilter})`,
    );
    for (const row of intake) {
      if (!row.user_id || !row.referral_code) continue;
      const creatorId = creatorByCode.get(row.referral_code.toLowerCase());
      if (creatorId) creatorByUser.set(row.user_id, creatorId);
    }
  }

  // key: `${day}|${creatorId}` with '' meaning the company-wide total row.
  const totals = new Map<string, DayTotals>();
  const bump = (
    day: string,
    creatorId: string | null,
    apply: (t: DayTotals) => void,
  ) => {
    for (const key of creatorId ? [`${day}|`, `${day}|${creatorId}`] : [`${day}|`]) {
      const entry = totals.get(key) ?? emptyTotals();
      apply(entry);
      totals.set(key, entry);
    }
  };

  for (const row of profiles) {
    const creatorId = row.user_id ? (creatorByUser.get(row.user_id) ?? null) : null;
    if (row.created_at && row.created_at >= sinceIso) {
      bump(dayOf(row.created_at), creatorId, (t) => {
        t.new_accounts += 1;
      });
    }
    if (row.trial_started_at && row.trial_started_at >= sinceIso) {
      bump(dayOf(row.trial_started_at), creatorId, (t) => {
        t.free_trials += 1;
      });
    }
  }
  for (const row of subscriptions) {
    if (!row.paid_at) continue;
    const creatorId = row.user_id ? (creatorByUser.get(row.user_id) ?? null) : null;
    const cents = typeof row.amount_cents === 'number' ? row.amount_cents : 0;
    bump(dayOf(row.paid_at), creatorId, (t) => {
      t.sales_count += 1;
      t.sales_cents += cents;
    });
  }

  const upserts = [...totals.entries()].map(([key, t]) => {
    const [day, creatorId] = key.split('|');
    return {
      company_id: companyId,
      creator_id: creatorId === '' ? null : creatorId,
      day,
      new_accounts: t.new_accounts,
      free_trials: t.free_trials,
      sales_count: t.sales_count,
      sales_cents: t.sales_cents,
      synced_at: new Date().toISOString(),
    };
  });

  if (upserts.length > 0) {
    const { error } = await admin
      .from('conversion_daily')
      .upsert(upserts, { onConflict: 'company_id,day,creator_id' });
    if (error) throw error;
  }
  return { rows: upserts.length };
}

// ————— Stripe source —————

const STRIPE_API = 'https://api.stripe.com/v1';
const CODE_KEYS = ['referral_code', 'ref', 'noni_code', 'promo_code'];

type StripeList<T> = { data: T[]; has_more: boolean };
type StripeCustomer = { id: string; created: number; metadata?: Record<string, string> | null };
type StripeSubscription = { id: string; customer: string | null; trial_start: number | null };
type StripePromotionCode = { id: string; code: string };
type StripeDiscount = { promotion_code?: string | { id: string } | null };
type StripeInvoice = { id: string; customer: string | null; discounts?: (StripeDiscount | string)[] | null };
type StripeSession = { id: string; customer: string | null; discounts?: StripeDiscount[] | null };
type StripeCharge = {
  id: string;
  created: number;
  paid: boolean;
  status: string;
  amount: number;
  amount_refunded: number;
  customer: string | null;
  metadata?: Record<string, string> | null;
};

/** Every object of a Stripe list created since `since`, read on the connected account. */
async function stripeList<T extends { id: string }>(
  account: string,
  path: string,
  since: number,
  extra: Record<string, string> = {},
): Promise<T[]> {
  const key = Deno.env.get('STRIPE_SECRET_KEY');
  if (!key) throw new Error('STRIPE_SECRET_KEY missing');
  const rows: T[] = [];
  let after: string | null = null;
  for (;;) {
    const params = new URLSearchParams({ limit: '100', ...extra });
    if (since > 0) params.set('created[gte]', String(since));
    if (after) params.set('starting_after', after);
    const res = await fetch(`${STRIPE_API}/${path}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${key}`, 'Stripe-Account': account },
    });
    if (!res.ok) {
      throw new Error(`stripe ${path} for ${account}: ${res.status} ${(await res.text()).slice(0, 300)}`);
    }
    const page = (await res.json()) as StripeList<T>;
    rows.push(...page.data);
    if (!page.has_more || page.data.length === 0) return rows;
    after = page.data[page.data.length - 1].id;
  }
}

function codeIn(metadata: Record<string, string> | null | undefined): string | null {
  if (!metadata) return null;
  for (const key of CODE_KEYS) {
    const value = metadata[key];
    if (typeof value === 'string' && value.trim()) return value.trim().toLowerCase();
  }
  return null;
}

function dayOfUnix(seconds: number): string {
  return new Date(seconds * 1000).toISOString().slice(0, 10);
}

async function syncStripe(
  companyId: string,
  account: string,
  days: number,
  /** Customers to leave out: on Noni's own account, the companies paying Noni. */
  skipCustomers?: Set<string>,
): Promise<{ rows: number }> {
  const admin = adminClient();
  const windowStart = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  windowStart.setUTCHours(0, 0, 0, 0);
  const since = Math.floor(windowStart.getTime() / 1000);

  const { data: links, error: linksError } = await admin
    .from('attribution_links')
    .select('code, creator_id')
    .eq('company_id', companyId)
    .not('creator_id', 'is', null);
  if (linksError) throw linksError;
  const creatorByCode = new Map<string, string>();
  for (const link of links ?? []) {
    creatorByCode.set((link.code as string).toLowerCase(), link.creator_id as string);
  }

  const hasCodes = creatorByCode.size > 0;
  const [allCustomers, allSubscriptions, allCharges, promos, invoices, sessions] = await Promise.all([
    stripeList<StripeCustomer>(account, 'customers', since),
    stripeList<StripeSubscription>(account, 'subscriptions', since, { status: 'all' }),
    stripeList<StripeCharge>(account, 'charges', since),
    // Promotion-code lookups only matter once a creator has a code.
    hasCodes ? stripeList<StripePromotionCode>(account, 'promotion_codes', 0) : Promise.resolve([]),
    hasCodes
      ? stripeList<StripeInvoice>(account, 'invoices', since, { status: 'paid', 'expand[]': 'data.discounts' })
      : Promise.resolve([]),
    hasCodes
      ? stripeList<StripeSession>(account, 'checkout/sessions', since, { status: 'complete', 'expand[]': 'data.discounts' })
      : Promise.resolve([]),
  ]);

  const skipped = (customer: string | null) => !!customer && !!skipCustomers?.has(customer);
  const customers = allCustomers.filter((c) => !skipped(c.id));
  const subscriptions = allSubscriptions.filter((s) => !skipped(s.customer));
  const charges = allCharges.filter((c) => !skipped(c.customer));

  const creatorOf = (code: string | null): string | null =>
    code ? (creatorByCode.get(code) ?? null) : null;
  const creatorByCustomer = new Map<string, string>();
  for (const c of customers) {
    const creatorId = creatorOf(codeIn(c.metadata));
    if (creatorId) creatorByCustomer.set(c.id, creatorId);
  }
  // Promotion code id -> the creator whose code it is.
  const creatorByPromo = new Map<string, string>();
  for (const promo of promos) {
    const creatorId = creatorOf(promo.code?.toLowerCase() ?? null);
    if (creatorId) creatorByPromo.set(promo.id, creatorId);
  }
  const claim = (customer: string | null, discounts: (StripeDiscount | string)[] | null | undefined) => {
    if (!customer || creatorByCustomer.has(customer)) return;
    for (const d of discounts ?? []) {
      if (typeof d === 'string') continue;
      const promo = typeof d.promotion_code === 'string' ? d.promotion_code : d.promotion_code?.id;
      const creatorId = promo ? creatorByPromo.get(promo) : undefined;
      if (creatorId) {
        creatorByCustomer.set(customer, creatorId);
        return;
      }
    }
  };
  if (creatorByPromo.size > 0) {
    for (const inv of invoices) claim(inv.customer, inv.discounts);
    for (const cs of sessions) claim(cs.customer, cs.discounts);
  }

  // key: `${day}|${creatorId}` with '' meaning the company-wide total row.
  // Every day of the window gets a company-wide row, so a day whose sales
  // were refunded (or that an earlier source filled) is corrected to zero.
  const totals = new Map<string, DayTotals>();
  for (let t = windowStart.getTime(); t <= Date.now(); t += 24 * 60 * 60 * 1000) {
    totals.set(`${new Date(t).toISOString().slice(0, 10)}|`, emptyTotals());
  }
  const bump = (day: string, creatorId: string | null, apply: (t: DayTotals) => void) => {
    for (const key of creatorId ? [`${day}|`, `${day}|${creatorId}`] : [`${day}|`]) {
      const entry = totals.get(key) ?? emptyTotals();
      apply(entry);
      totals.set(key, entry);
    }
  };

  for (const c of customers) {
    bump(dayOfUnix(c.created), creatorByCustomer.get(c.id) ?? null, (t) => {
      t.new_accounts += 1;
    });
  }
  for (const sub of subscriptions) {
    if (!sub.trial_start || sub.trial_start < since) continue;
    const creatorId = sub.customer ? (creatorByCustomer.get(sub.customer) ?? null) : null;
    bump(dayOfUnix(sub.trial_start), creatorId, (t) => {
      t.free_trials += 1;
    });
  }
  for (const ch of charges) {
    if (!ch.paid || ch.status !== 'succeeded') continue;
    const cents = ch.amount - (ch.amount_refunded ?? 0);
    if (cents <= 0) continue;
    const creatorId =
      creatorOf(codeIn(ch.metadata)) ??
      (ch.customer ? (creatorByCustomer.get(ch.customer) ?? null) : null);
    bump(dayOfUnix(ch.created), creatorId, (t) => {
      t.sales_count += 1;
      t.sales_cents += cents;
    });
  }

  const syncedAt = new Date().toISOString();
  const upserts = [...totals.entries()].map(([key, t]) => {
    const [day, creatorId] = key.split('|');
    return {
      company_id: companyId,
      creator_id: creatorId === '' ? null : creatorId,
      day,
      new_accounts: t.new_accounts,
      free_trials: t.free_trials,
      sales_count: t.sales_count,
      sales_cents: t.sales_cents,
      synced_at: syncedAt,
    };
  });
  // Per-creator rows are rebuilt for the window: a code that was removed or
  // moved to another creator must not leave its old credit behind.
  const { error: clearError } = await admin
    .from('conversion_daily')
    .delete()
    .eq('company_id', companyId)
    .not('creator_id', 'is', null)
    .gte('day', windowStart.toISOString().slice(0, 10));
  if (clearError) throw clearError;
  for (let i = 0; i < upserts.length; i += 500) {
    const { error } = await admin
      .from('conversion_daily')
      .upsert(upserts.slice(i, i + 500), { onConflict: 'company_id,day,creator_id' });
    if (error) throw error;
  }
  return { rows: upserts.length };
}

// ————— Dispatch —————

type SyncResult = { company_id: string; source: 'stripe' | 'fieldvision' | 'none'; rows: number; error?: string };

/** A real connected account, not the dev placeholder the web writes in simulated mode. */
function realAccount(id: string | null | undefined): string | null {
  return id && id.startsWith('acct_') && !id.includes('simulated') ? id : null;
}

/** Whether Noni runs this company itself: the only kind allowed to report on
 *  Noni's own Stripe account (Stripe Connect cannot link a platform to itself). */
async function runsOnPlatformStripe(companyId: string): Promise<boolean> {
  const { data, error } = await adminClient()
    .from('platform_stripe_companies')
    .select('company_id')
    .eq('company_id', companyId)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

/** Stripe customers that are companies paying Noni. They live in Noni's own
 *  account and are Noni's revenue, never an in-house company's sales. */
async function noniCustomerIds(): Promise<Set<string>> {
  const { data, error } = await adminClient()
    .from('company_billing')
    .select('stripe_customer_id')
    .not('stripe_customer_id', 'is', null);
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.stripe_customer_id as string));
}

let platformAccount: string | null | undefined;

/** The account behind STRIPE_SECRET_KEY, read once per invocation. */
async function platformAccountId(): Promise<string | null> {
  if (platformAccount !== undefined) return platformAccount;
  const key = Deno.env.get('STRIPE_SECRET_KEY');
  if (!key) throw new Error('STRIPE_SECRET_KEY missing');
  const res = await fetch(`${STRIPE_API}/account`, { headers: { Authorization: `Bearer ${key}` } });
  if (!res.ok) throw new Error(`stripe account: ${res.status}`);
  platformAccount = ((await res.json()) as { id?: string }).id ?? null;
  return platformAccount;
}

// ————— Sign-ups from the company's own Supabase project —————

const SUPABASE_API = 'https://api.supabase.com/v1';

/** Daily sign-up counts by referral code, straight from the company's auth.users. Counts only. */
const SIGNUPS_QUERY = `
select (u.created_at at time zone 'utc')::date as day,
       coalesce(
         nullif(u.raw_user_meta_data->>'referral_code', ''),
         nullif(u.raw_user_meta_data->>'promo_code', ''),
         nullif(u.raw_user_meta_data->>'ref', '')
       ) as code,
       count(*)::int as count
from auth.users u
group by 1, 2`;

/**
 * Trades the stored refresh token for an access token. Supabase rotates the
 * refresh token on every use, so the new one is saved before anything else.
 */
async function supabaseAccessToken(companyId: string): Promise<string | null> {
  const clientId = Deno.env.get('NONI_SB_OAUTH_CLIENT_ID');
  const clientSecret = Deno.env.get('NONI_SB_OAUTH_CLIENT_SECRET');
  if (!clientId || !clientSecret) throw new Error('NONI_SB_OAUTH_CLIENT_ID / NONI_SB_OAUTH_CLIENT_SECRET missing');
  const admin = adminClient();
  const { data: refresh, error } = await admin.rpc('get_supabase_refresh_token', { p_company: companyId });
  if (error) throw error;
  if (typeof refresh !== 'string' || !refresh) return null;

  const res = await fetch(`${SUPABASE_API}/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refresh }),
  });
  if (!res.ok) throw new Error(`supabase token refresh: ${res.status} ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as { access_token?: string; refresh_token?: string };
  if (json.refresh_token) {
    const { error: saveError } = await admin.rpc('set_supabase_refresh_token', {
      p_company: companyId,
      p_token: json.refresh_token,
    });
    if (saveError) throw saveError;
  }
  return json.access_token ?? null;
}

/**
 * A company that connected its Supabase project counts sign-ups from there,
 * not from Stripe customers. Reads the whole history as daily counts (cheap:
 * one grouped query) and rebuilds conversion_daily.new_accounts from it.
 * Runs after the Stripe pass, which rewrites the window.
 */
async function syncSignups(companyId: string): Promise<'synced' | 'off'> {
  const admin = adminClient();
  const { data: source, error } = await admin
    .from('company_signup_sources')
    .select('project_ref')
    .eq('company_id', companyId)
    .maybeSingle();
  if (error) throw error;
  const ref = source?.project_ref as string | null | undefined;
  if (!ref) return 'off';

  try {
    const accessToken = await supabaseAccessToken(companyId);
    if (!accessToken) return 'off';
    const res = await fetch(`${SUPABASE_API}/projects/${ref}/database/query/read-only`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: SIGNUPS_QUERY }),
    });
    if (!res.ok) throw new Error(`supabase query for ${ref}: ${res.status} ${(await res.text()).slice(0, 200)}`);
    const raw = (await res.json()) as unknown;
    const list = Array.isArray(raw) ? raw : ((raw as { result?: unknown[] })?.result ?? []);
    const rows = (list as Record<string, unknown>[])
      .map((r) => ({
        day: String(r.day ?? '').slice(0, 10),
        code: typeof r.code === 'string' ? r.code.trim().toLowerCase().slice(0, 64) : '',
        count: Math.floor(Number(r.count)),
      }))
      .filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.day) && Number.isFinite(r.count) && r.count > 0);

    const { error: recordError } = await admin.rpc('record_signups', {
      p_company: companyId,
      p_rows: rows,
      p_mode: 'history',
    });
    if (recordError) throw recordError;
    await admin.from('company_signup_sources').update({ last_error: null }).eq('company_id', companyId);
    return 'synced';
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await admin.from('company_signup_sources').update({ last_error: message.slice(0, 500) }).eq('company_id', companyId);
    throw e;
  }
}

/** Re-applies tracked sign-ups over whatever the Stripe pass wrote. */
async function applyTrackedSignups(companyId: string): Promise<void> {
  const admin = adminClient();
  if ((await syncSignups(companyId)) === 'synced') return;
  // A company reporting through track-signup instead: rebuild from what it sent.
  const { data } = await admin
    .from('company_signup_sources')
    .select('last_event_at')
    .eq('company_id', companyId)
    .maybeSingle();
  if (!data?.last_event_at) return;
  const { error } = await admin.rpc('refresh_signups', { p_company: companyId, p_from: '2000-01-01' });
  if (error) throw error;
}

async function syncCompany(companyId: string, days: number, only?: string): Promise<SyncResult> {
  const result: SyncResult =
    only === 'signups' ? { company_id: companyId, source: 'none', rows: 0 } : await syncSources(companyId, days);
  try {
    await applyTrackedSignups(companyId);
  } catch (e) {
    console.error(`sync-conversions ${companyId}: tracked sign-ups not applied:`, e instanceof Error ? e.message : String(e));
  }
  return result;
}

async function syncSources(companyId: string, days: number): Promise<SyncResult> {
  const admin = adminClient();
  try {
    const { data: billing, error } = await admin
      .from('company_billing')
      .select('stripe_account_id')
      .eq('company_id', companyId)
      .maybeSingle();
    if (error) throw error;
    const account = realAccount(billing?.stripe_account_id as string | null | undefined);
    // Noni's own Stripe account must never feed a customer company's numbers
    // (an old web build could attach it). Fail closed if it cannot be told apart.
    const onPlatform = !!account && account === (await platformAccountId());
    if (onPlatform && !(await runsOnPlatformStripe(companyId))) {
      console.warn(`sync-conversions ${companyId}: skipped, linked to the platform Stripe account`);
      return { company_id: companyId, source: 'none', rows: 0 };
    }
    if (account) {
      const { rows } = await syncStripe(companyId, account, days, onPlatform ? await noniCustomerIds() : undefined);
      return { company_id: companyId, source: 'stripe', rows };
    }
    if (
      Deno.env.get('FIELDVISION_COMPANY_ID') === companyId &&
      Deno.env.get('FIELDVISION_URL') &&
      Deno.env.get('FIELDVISION_SERVICE_KEY')
    ) {
      const { rows } = await syncFieldVision(companyId, days);
      return { company_id: companyId, source: 'fieldvision', rows };
    }
    return { company_id: companyId, source: 'none', rows: 0 };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`sync-conversions failed for ${companyId}:`, message);
    return { company_id: companyId, source: 'none', rows: 0, error: message };
  }
}

async function runAll(days: number, only?: string): Promise<void> {
  const admin = adminClient();
  const { data, error } = await admin.from('companies').select('id');
  if (error) {
    console.error('sync-conversions: could not list companies:', error.message);
    return;
  }
  for (const row of data ?? []) {
    const result = await syncCompany(row.id as string, days, only);
    console.log(`sync-conversions ${result.company_id}: source=${result.source} rows=${result.rows}`);
  }
}

Deno.serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;
  try {
    const admin = adminClient();
    const caller = await authenticate(req, admin);
    if (!caller) return jsonResponse({ error: 'unauthorized' }, 401);

    const body = (await req.json().catch(() => null)) as { days?: number; only?: string } | null;
    const only = body?.only === 'signups' ? 'signups' : undefined;
    const days = Math.min(Math.max(Math.floor(body?.days ?? 90), 1), 365);

    if (caller.kind === 'cron') {
      // The cron call has a short HTTP timeout; the sync finishes in the background.
      EdgeRuntime.waitUntil(runAll(days, only));
      return jsonResponse({ started: true }, 202);
    }

    if (
      caller.role !== 'campaign_manager' ||
      !caller.companyId ||
      !(await isManagerOf(admin, caller.userId, caller.companyId, caller.platformAdmin))
    ) {
      return jsonResponse({ error: 'forbidden' }, 403);
    }
    const result = await syncCompany(caller.companyId, days, only);
    if (result.error) return jsonResponse({ error: result.error }, 502);
    return jsonResponse({ ...result, days });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('sync-conversions failed:', message);
    return jsonResponse({ error: message }, 500);
  }
});
