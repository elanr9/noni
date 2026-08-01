import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import {
  adminClient,
  authenticate,
  jsonResponse,
} from '../_shared/wp8.ts';

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

type PostRow = {
  id: string;
  platform: string | null;
  provider_post_id: string | null;
  task_id: string;
  submissions: { creator_id: string } | { creator_id: string }[] | null;
  content_tasks: { company_id: string } | { company_id: string }[] | null;
};

type PlatformMetrics = {
  views?: number | null;
  likes?: number | null;
  comments?: number | null;
  shares?: number | null;
  impressions?: number | null;
};

function uploadPostKey(): string {
  const key = Deno.env.get('UPLOAD_POST_API_KEY');
  if (!key) throw new Error('UPLOAD_POST_API_KEY missing');
  return key;
}

function asInt(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    if (Number.isFinite(n)) return Math.max(0, Math.floor(n));
  }
  return 0;
}

function parseBounty(settings: unknown): {
  amountCents: number;
  viewThreshold: number;
} {
  const obj =
    settings && typeof settings === 'object' && !Array.isArray(settings)
      ? (settings as Record<string, unknown>)
      : {};
  const amount = asInt(obj.bounty_amount_cents);
  const threshold = asInt(obj.bounty_view_threshold);
  return {
    amountCents: amount > 0 ? amount : 2000,
    viewThreshold: threshold > 0 ? threshold : 5000,
  };
}

function unwrapOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function extractMetrics(
  body: Record<string, unknown>,
  platform: string | null,
): { views: number; likes: number; comments: number; shares: number } | null {
  const platforms = body.platforms;
  if (!platforms || typeof platforms !== 'object' || Array.isArray(platforms)) {
    return null;
  }
  const map = platforms as Record<string, unknown>;
  const keys = platform && map[platform] ? [platform] : Object.keys(map);
  for (const key of keys) {
    const entry = map[key];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const row = entry as Record<string, unknown>;
    if (row.success === false) continue;
    const metrics = (row.post_metrics ?? row.metrics) as PlatformMetrics | undefined;
    if (!metrics || typeof metrics !== 'object') continue;
    const views = asInt(metrics.views ?? metrics.impressions);
    return {
      views,
      likes: asInt(metrics.likes),
      comments: asInt(metrics.comments),
      shares: asInt(metrics.shares),
    };
  }
  return null;
}

async function fetchPostAnalytics(
  requestId: string,
  platform: string | null,
): Promise<{ views: number; likes: number; comments: number; shares: number } | null> {
  const url = new URL(
    `https://api.upload-post.com/api/uploadposts/post-analytics/${encodeURIComponent(requestId)}`,
  );
  if (platform) url.searchParams.set('platform', platform);
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Apikey ${uploadPostKey()}` },
  });
  if (!res.ok) {
    console.error(`post-analytics ${requestId}: ${res.status} ${await res.text()}`);
    return null;
  }
  const body = (await res.json()) as Record<string, unknown>;
  return extractMetrics(body, platform);
}

async function ensureWallet(
  admin: SupabaseClient,
  companyId: string,
  creatorId: string,
): Promise<{ id: string; available_cents: number }> {
  const { data: existing } = await admin
    .from('creator_wallets')
    .select('id, available_cents')
    .eq('company_id', companyId)
    .eq('creator_id', creatorId)
    .maybeSingle();
  if (existing) return existing;

  const { data, error } = await admin
    .from('creator_wallets')
    .insert({ company_id: companyId, creator_id: creatorId })
    .select('id, available_cents')
    .single();
  if (error) {
    const { data: again, error: againError } = await admin
      .from('creator_wallets')
      .select('id, available_cents')
      .eq('company_id', companyId)
      .eq('creator_id', creatorId)
      .single();
    if (againError) throw error;
    return again;
  }
  return data;
}

async function maybeCreditBounty(
  admin: SupabaseClient,
  params: {
    companyId: string;
    creatorId: string;
    postId: string;
    views: number;
    amountCents: number;
    viewThreshold: number;
  },
): Promise<boolean> {
  if (params.views < params.viewThreshold) return false;

  const { data: existing } = await admin
    .from('wallet_ledger')
    .select('id')
    .eq('post_id', params.postId)
    .eq('kind', 'bounty_credit')
    .maybeSingle();
  if (existing) return false;

  const wallet = await ensureWallet(admin, params.companyId, params.creatorId);

  const { error: ledgerError } = await admin.from('wallet_ledger').insert({
    company_id: params.companyId,
    creator_id: params.creatorId,
    kind: 'bounty_credit',
    amount_cents: params.amountCents,
    post_id: params.postId,
    note: `Bounty at ${params.viewThreshold} views`,
  });
  if (ledgerError) {
    // Unique (post_id, kind) — already credited by a concurrent poll.
    if (ledgerError.code === '23505') return false;
    throw ledgerError;
  }

  const { error: balError } = await admin
    .from('creator_wallets')
    .update({ available_cents: wallet.available_cents + params.amountCents })
    .eq('id', wallet.id)
    .eq('available_cents', wallet.available_cents);
  if (balError) throw balError;

  return true;
}

async function pollCompany(admin: SupabaseClient, companyId: string): Promise<{
  polled: number;
  credited: number;
  skipped: number;
}> {
  const { data: company } = await admin
    .from('companies')
    .select('settings')
    .eq('id', companyId)
    .single();
  const bounty = parseBounty(company?.settings);

  const { data: tasks, error: tasksError } = await admin
    .from('content_tasks')
    .select('id')
    .eq('company_id', companyId);
  if (tasksError) throw tasksError;
  const taskIds = (tasks ?? []).map((t) => t.id as string);
  if (taskIds.length === 0) return { polled: 0, credited: 0, skipped: 0 };

  const { data: posts, error } = await admin
    .from('posts')
    .select(
      'id, platform, provider_post_id, task_id, submissions!inner(creator_id), content_tasks!inner(company_id)',
    )
    .in('task_id', taskIds)
    .not('provider_post_id', 'is', null)
    .in('status', ['posted', 'pending']);
  if (error) throw error;

  let polled = 0;
  let credited = 0;
  let skipped = 0;

  for (const raw of (posts ?? []) as PostRow[]) {
    const requestId = raw.provider_post_id;
    const submission = unwrapOne(raw.submissions);
    const task = unwrapOne(raw.content_tasks);
    if (!requestId || !submission || !task) {
      skipped += 1;
      continue;
    }

    const metrics = await fetchPostAnalytics(requestId, raw.platform);
    if (!metrics) {
      skipped += 1;
      continue;
    }

    const { error: insertError } = await admin.from('post_metrics').insert({
      post_id: raw.id,
      views: metrics.views,
      likes: metrics.likes,
      comments: metrics.comments,
      shares: metrics.shares,
    });
    if (insertError) {
      console.error(`post_metrics insert ${raw.id}:`, insertError.message);
      skipped += 1;
      continue;
    }
    polled += 1;

    // Max views across history (spec: threshold on max views for the post).
    const { data: history } = await admin
      .from('post_metrics')
      .select('views')
      .eq('post_id', raw.id);
    const maxViews = Math.max(
      metrics.views,
      ...(history ?? []).map((r) => asInt(r.views)),
    );

    const didCredit = await maybeCreditBounty(admin, {
      companyId,
      creatorId: submission.creator_id,
      postId: raw.id,
      views: maxViews,
      amountCents: bounty.amountCents,
      viewThreshold: bounty.viewThreshold,
    });
    if (didCredit) credited += 1;
  }

  return { polled, credited, skipped };
}

async function run(companyIds: string[]): Promise<void> {
  const admin = adminClient();
  for (const id of companyIds) {
    try {
      const result = await pollCompany(admin, id);
      console.log(
        `poll-metrics ${id}: polled=${result.polled} credited=${result.credited} skipped=${result.skipped}`,
      );
    } catch (e) {
      console.error(`poll-metrics failed for ${id}:`, e);
    }
  }
}

Deno.serve(async (req) => {
  const admin = adminClient();
  const caller = await authenticate(req, admin);
  if (!caller) return jsonResponse({ error: 'unauthorized' }, 401);
  if (caller.kind === 'user' && caller.role !== 'admin') {
    return jsonResponse({ error: 'forbidden' }, 403);
  }

  let companyIds: string[];
  if (caller.kind === 'user') {
    companyIds = [caller.companyId];
  } else {
    const { data } = await admin.from('companies').select('id');
    companyIds = (data ?? []).map((r) => r.id as string);
  }

  EdgeRuntime.waitUntil(run(companyIds));
  return jsonResponse({ started: true, companies: companyIds.length }, 202);
});
