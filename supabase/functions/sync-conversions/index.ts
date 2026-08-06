// Pulls conversion AGGREGATES from the FieldVision product database (a
// separate Supabase project) into Noni's conversion_daily table.
//
// Contract with the admin: daily counts of signups, trials started, and
// revenue, plus the per-creator attribution cut. Individual FieldVision user
// rows are never persisted in Noni; only timestamp, amount, and referral-code
// columns are read, aggregated in memory, and discarded.
//
// Env: FIELDVISION_URL, FIELDVISION_SERVICE_KEY (read-only, narrow scope),
// optional FIELDVISION_COMPANY_ID (defaults to the only company row).

import {
  adminClient,
  authenticate,
  handleCors,
  jsonResponse,
} from '../_shared/wp8.ts';

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

async function sync(companyId: string, days: number): Promise<{ rows: number }> {
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

/** FieldVision conversions belong to one Noni company. */
async function resolveCompanyId(): Promise<string> {
  const fromEnv = Deno.env.get('FIELDVISION_COMPANY_ID');
  if (fromEnv) return fromEnv;
  const admin = adminClient();
  const { data, error } = await admin.from('companies').select('id');
  if (error) throw error;
  if (!data || data.length !== 1) {
    throw new Error('set FIELDVISION_COMPANY_ID: company is ambiguous');
  }
  return data[0].id as string;
}

Deno.serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;
  try {
    const admin = adminClient();
    const caller = await authenticate(req, admin);
    if (!caller) return jsonResponse({ error: 'unauthorized' }, 401);
    if (caller.kind === 'user' && caller.role !== 'admin') {
      return jsonResponse({ error: 'forbidden' }, 403);
    }

    const companyId = await resolveCompanyId();
    if (caller.kind === 'user' && caller.companyId !== companyId) {
      return jsonResponse({ error: 'forbidden' }, 403);
    }

    const body = (await req.json().catch(() => null)) as { days?: number } | null;
    const days = Math.min(Math.max(Math.floor(body?.days ?? 90), 1), 365);

    const result = await sync(companyId, days);
    console.log(`sync-conversions ${companyId}: days=${days} rows=${result.rows}`);
    return jsonResponse({ company_id: companyId, days, rows: result.rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('sync-conversions failed:', message);
    return jsonResponse({ error: message }, 500);
  }
});
