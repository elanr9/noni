import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import {
  adminClient,
  authenticate,
  handleCors,
  jsonResponse,
} from '../_shared/wp8.ts';
import { adminPushTokens, sendExpoPush } from '../_shared/push.ts';

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

// The only purely positive notification in the product. Fires once per post
// per threshold, claimed atomically via claim_post_milestone.
const MILESTONES = [5000, 10000, 50000, 100000, 1000000] as const;

function milestoneLabel(threshold: number): string {
  return threshold >= 1_000_000
    ? `${threshold / 1_000_000}m`
    : `${threshold / 1000}k`;
}

type PostRow = {
  id: string;
  platform: string | null;
  provider_post_id: string | null;
  post_url: string | null;
  task_id: string;
  milestones_fired: number[] | null;
  submissions: { creator_id: string } | { creator_id: string }[] | null;
};

type PlatformMetrics = {
  views?: number | null;
  likes?: number | null;
  comments?: number | null;
  shares?: number | null;
  saves?: number | null;
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

type FetchedMetrics = {
  views: number;
  likes: number;
  comments: number;
  shares: number;
  /** Null when the platform does not report saves; distinct from zero. */
  saves: number | null;
};

function extractMetrics(
  body: Record<string, unknown>,
  platform: string | null,
): FetchedMetrics | null {
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
      saves: metrics.saves === null || metrics.saves === undefined
        ? null
        : asInt(metrics.saves),
    };
  }
  return null;
}

async function fetchPostAnalytics(
  requestId: string,
  platform: string | null,
): Promise<FetchedMetrics | null> {
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

/**
 * Assignment-level bounty. The CAS on bounty_credited_at is the idempotency
 * guard; the ledger unique (post_id, kind) backstops legacy per-post credits.
 */
async function creditAssignmentBounty(
  admin: SupabaseClient,
  params: {
    companyId: string;
    creatorId: string;
    assignmentId: string;
    postId: string;
    amountCents: number;
    viewThreshold: number;
  },
): Promise<boolean> {
  const { data: claimed, error: claimError } = await admin
    .from('assignments')
    .update({
      bounty_credited_at: new Date().toISOString(),
      bounty_amount_cents: params.amountCents,
    })
    .eq('id', params.assignmentId)
    .is('bounty_credited_at', null)
    .select('id');
  if (claimError) throw claimError;
  if (!claimed?.length) return false;

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

type AssignmentRow = {
  id: string;
  creator_id: string;
  task_id: string | null;
  brief_id: string | null;
  post_url: string | null;
  bounty_credited_at: string | null;
  music_approved_at: string | null;
  metrics: Record<string, unknown> | null;
};

type AssignmentRollup = {
  creatorId: string;
  views: number;
  likes: number;
  postId: string;
  postUrl: string | null;
};

/** Revenue cents per assignment via attribution_links (assignment or task key). */
async function revenueByAssignment(
  admin: SupabaseClient,
  companyId: string,
  assignmentByTask: Map<string, AssignmentRow>,
): Promise<Map<string, number>> {
  const [{ data: links, error: linksError }, { data: events, error: eventsError }] =
    await Promise.all([
      admin
        .from('attribution_links')
        .select('id, task_id, assignment_id')
        .eq('company_id', companyId),
      admin
        .from('revenue_events')
        .select('amount_cents, attribution_link_id')
        .eq('company_id', companyId),
    ]);
  if (linksError) throw linksError;
  if (eventsError) throw eventsError;

  const linkToAssignment = new Map<string, string>();
  for (const link of links ?? []) {
    const assignmentId =
      (link.assignment_id as string | null) ??
      (link.task_id ? assignmentByTask.get(link.task_id as string)?.id ?? null : null);
    if (assignmentId) linkToAssignment.set(link.id as string, assignmentId);
  }

  const revenue = new Map<string, number>();
  for (const event of events ?? []) {
    if (!event.attribution_link_id) continue;
    const assignmentId = linkToAssignment.get(event.attribution_link_id as string);
    if (!assignmentId) continue;
    revenue.set(
      assignmentId,
      (revenue.get(assignmentId) ?? 0) + asInt(event.amount_cents),
    );
  }
  return revenue;
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

  const { data: assignments, error: assignmentsError } = await admin
    .from('assignments')
    .select(
      'id, creator_id, task_id, brief_id, post_url, bounty_credited_at, music_approved_at, metrics',
    )
    .eq('company_id', companyId);
  if (assignmentsError) throw assignmentsError;
  const assignmentById = new Map<string, AssignmentRow>();
  const assignmentByTask = new Map<string, AssignmentRow>();
  for (const raw of (assignments ?? []) as AssignmentRow[]) {
    assignmentById.set(raw.id, raw);
    if (raw.task_id) assignmentByTask.set(raw.task_id, raw);
  }

  // Music gate needs the brief's format: photo_carousel earnings unlock only
  // after the admin approves the song. Videos skip the music loop entirely.
  const briefIds = [
    ...new Set(
      (assignments ?? [])
        .map((a) => a.brief_id as string | null)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const briefFormat = new Map<string, string>();
  if (briefIds.length > 0) {
    const { data: briefs, error: briefsError } = await admin
      .from('briefs')
      .select('id, format')
      .in('id', briefIds);
    if (briefsError) throw briefsError;
    for (const brief of briefs ?? []) {
      briefFormat.set(brief.id as string, (brief.format as string | null) ?? 'video');
    }
  }

  const { data: tasks, error: tasksError } = await admin
    .from('content_tasks')
    .select('id')
    .eq('company_id', companyId);
  if (tasksError) throw tasksError;
  const taskIds = (tasks ?? []).map((t) => t.id as string);

  // Two shapes of posts: assignment-keyed (campaign publishes) and legacy
  // task-keyed. A post never appears in both queries.
  const assignmentIds = [...assignmentById.keys()];
  const [assignmentPostsRes, taskPostsRes] = await Promise.all([
    assignmentIds.length > 0
      ? admin
          .from('posts')
          .select(
            'id, platform, provider_post_id, post_url, assignment_id, milestones_fired',
          )
          .in('assignment_id', assignmentIds)
          .not('provider_post_id', 'is', null)
          .in('status', ['posted', 'pending'])
      : Promise.resolve({ data: [], error: null }),
    taskIds.length > 0
      ? admin
          .from('posts')
          .select(
            'id, platform, provider_post_id, post_url, task_id, milestones_fired, submissions!inner(creator_id)',
          )
          .in('task_id', taskIds)
          .is('assignment_id', null)
          .not('provider_post_id', 'is', null)
          .in('status', ['posted', 'pending'])
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (assignmentPostsRes.error) throw assignmentPostsRes.error;
  if (taskPostsRes.error) throw taskPostsRes.error;

  type PendingPost = {
    postId: string;
    requestId: string;
    platform: string | null;
    postUrl: string | null;
    milestonesFired: number[];
    assignment: AssignmentRow | null;
    creatorId: string | null;
  };
  const pending: PendingPost[] = [];

  for (const raw of assignmentPostsRes.data ?? []) {
    const assignment = assignmentById.get(raw.assignment_id as string) ?? null;
    pending.push({
      postId: raw.id as string,
      requestId: raw.provider_post_id as string,
      platform: raw.platform as string | null,
      postUrl: raw.post_url as string | null,
      milestonesFired: (raw.milestones_fired as number[] | null) ?? [],
      assignment,
      creatorId: assignment?.creator_id ?? null,
    });
  }
  for (const raw of (taskPostsRes.data ?? []) as unknown as PostRow[]) {
    const submission = unwrapOne(raw.submissions);
    if (!raw.provider_post_id || !submission) continue;
    pending.push({
      postId: raw.id,
      requestId: raw.provider_post_id,
      platform: raw.platform,
      postUrl: raw.post_url,
      milestonesFired: raw.milestones_fired ?? [],
      assignment: assignmentByTask.get(raw.task_id) ?? null,
      creatorId: submission.creator_id,
    });
  }

  let polled = 0;
  let credited = 0;
  let skipped = 0;
  const rollups = new Map<string, AssignmentRollup>();
  type MilestoneClaim = {
    postId: string;
    platform: string | null;
    creatorId: string | null;
    assignmentId: string | null;
    threshold: number;
  };
  const milestoneClaims: MilestoneClaim[] = [];

  for (const post of pending) {
    const metrics = await fetchPostAnalytics(post.requestId, post.platform);
    if (!metrics) {
      skipped += 1;
      continue;
    }

    const { error: insertError } = await admin.from('post_metrics').insert({
      post_id: post.postId,
      views: metrics.views,
      likes: metrics.likes,
      comments: metrics.comments,
      shares: metrics.shares,
      saves: metrics.saves,
    });
    if (insertError) {
      console.error(`post_metrics insert ${post.postId}:`, insertError.message);
      skipped += 1;
      continue;
    }
    polled += 1;

    // Best views ever seen for this post (includes the snapshot just written),
    // so a platform undercount on one poll never hides a crossed threshold.
    const { data: history } = await admin
      .from('post_metrics')
      .select('views')
      .eq('post_id', post.postId);
    const bestViews = Math.max(
      metrics.views,
      ...(history ?? []).map((r) => asInt(r.views)),
    );

    // Milestones fire once per post per threshold. Membership check first,
    // then an atomic claim so a concurrent poll cannot double-fire.
    for (const threshold of MILESTONES) {
      if (bestViews < threshold) break;
      if (post.milestonesFired.includes(threshold)) continue;
      const { data: claimed, error: claimError } = await admin.rpc(
        'claim_post_milestone',
        { p_post_id: post.postId, p_threshold: threshold },
      );
      if (claimError) {
        console.error(`milestone claim ${post.postId}:`, claimError.message);
        continue;
      }
      if (claimed === true) {
        console.log(
          `milestone fired post=${post.postId} threshold=${threshold}`,
        );
        milestoneClaims.push({
          postId: post.postId,
          platform: post.platform,
          creatorId: post.creatorId,
          assignmentId: post.assignment?.id ?? null,
          threshold,
        });
      }
    }

    if (post.assignment) {
      // Roll up into the assignment; bounty is decided per assignment below.
      const rollup = rollups.get(post.assignment.id) ?? {
        creatorId: post.assignment.creator_id,
        views: 0,
        likes: 0,
        postId: post.postId,
        postUrl: null,
      };
      rollup.views += metrics.views;
      rollup.likes += asInt(metrics.likes);
      if (rollup.postUrl === null) rollup.postUrl = post.postUrl;
      rollups.set(post.assignment.id, rollup);
      continue;
    }

    if (!post.creatorId) {
      skipped += 1;
      continue;
    }

    // Legacy post with no assignment: per-post bounty on max views in history.
    const didCredit = await maybeCreditBounty(admin, {
      companyId,
      creatorId: post.creatorId,
      postId: post.postId,
      views: bestViews,
      amountCents: bounty.amountCents,
      viewThreshold: bounty.viewThreshold,
    });
    if (didCredit) credited += 1;
  }

  // One push per post that crossed something, naming the highest new
  // threshold. Sent only for claims this poll actually won.
  if (milestoneClaims.length > 0) {
    const topByPost = new Map<string, MilestoneClaim>();
    for (const claim of milestoneClaims) {
      const current = topByPost.get(claim.postId);
      if (!current || claim.threshold > current.threshold) {
        topByPost.set(claim.postId, claim);
      }
    }
    const creatorIds = [
      ...new Set(
        [...topByPost.values()]
          .map((c) => c.creatorId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const creatorName = new Map<string, string>();
    if (creatorIds.length > 0) {
      const { data: creators } = await admin
        .from('profiles')
        .select('id, full_name')
        .in('id', creatorIds);
      for (const c of creators ?? []) {
        creatorName.set(c.id as string, (c.full_name as string | null) ?? 'A creator');
      }
    }
    const tokens = await adminPushTokens(admin, companyId);
    for (const claim of topByPost.values()) {
      const name = claim.creatorId
        ? (creatorName.get(claim.creatorId) ?? 'A creator')
        : 'A creator';
      const where = claim.platform ? ` on ${claim.platform}` : '';
      try {
        await sendExpoPush(tokens, {
          title: 'Milestone',
          body: `${name}'s post crossed ${milestoneLabel(claim.threshold)} views${where}`,
          data: {
            post_id: claim.postId,
            assignment_id: claim.assignmentId,
            event: 'milestone',
          },
        });
      } catch (e) {
        console.error(`milestone push ${claim.postId}:`, e);
      }
    }
  }

  if (rollups.size === 0) return { polled, credited, skipped };

  const revenue = await revenueByAssignment(admin, companyId, assignmentByTask);

  for (const [assignmentId, rollup] of rollups) {
    const assignment = assignmentById.get(assignmentId);
    if (!assignment) continue;

    const previous =
      assignment.metrics && typeof assignment.metrics === 'object'
        ? assignment.metrics
        : {};
    const patch: Record<string, unknown> = {
      metrics: {
        views: rollup.views,
        likes: rollup.likes,
        revenue_cents: revenue.get(assignmentId) ?? 0,
      },
    };
    if (assignment.post_url === null && rollup.postUrl !== null) {
      patch.post_url = rollup.postUrl;
    }
    const { error: metricsError } = await admin
      .from('assignments')
      .update(patch)
      .eq('id', assignmentId);
    if (metricsError) {
      console.error(`assignment metrics ${assignmentId}:`, metricsError.message);
      continue;
    }

    // Threshold on the best views ever seen, so a platform undercount on one
    // poll never claws back an earned bounty.
    const bountyViews = Math.max(
      rollup.views,
      asInt((previous as Record<string, unknown>).views),
    );
    // Music gate (Agent 7 owns this): photo_carousel bounties additionally
    // require admin music approval on the assignment. Videos are never gated;
    // they skip the music loop entirely.
    const isCarousel =
      assignment.brief_id !== null &&
      briefFormat.get(assignment.brief_id) === 'photo_carousel';
    if (isCarousel && assignment.music_approved_at === null) {
      continue;
    }
    if (assignment.bounty_credited_at === null && bountyViews >= bounty.viewThreshold) {
      const didCredit = await creditAssignmentBounty(admin, {
        companyId,
        creatorId: rollup.creatorId,
        assignmentId,
        postId: rollup.postId,
        amountCents: bounty.amountCents,
        viewThreshold: bounty.viewThreshold,
      });
      if (didCredit) credited += 1;
    }
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
  const preflight = handleCors(req);
  if (preflight) return preflight;
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
