import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import {
  adminClient,
  authenticate,
  handleCors,
  jsonResponse,
} from '../_shared/wp8.ts';
import { formatCentsDollars } from '../_shared/credits.ts';
import {
  adminRecipients,
  creatorRecipients,
  sendPushWithPrefs as sendPush,
} from '../_shared/push.ts';
import { creatorLink, managerLink } from '../_shared/deep-link.ts';

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

// The only purely positive notification in the product. Fires once per post
// per threshold, claimed atomically via claim_post_milestone.
const MILESTONES = [5000, 10000, 50000, 100000, 1000000] as const;

// Views count toward pay for this long after a post goes live. Must match
// view_window_days in public.creator_pay_rates() (migration 144).
const VIEW_WINDOW_DAYS = 30;

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

async function notifyCreditsLow(
  admin: SupabaseClient,
  companyId: string,
): Promise<void> {
  try {
    const recipients = await adminRecipients(admin, companyId);
    await sendPush(admin, recipients, {
      title: 'Credits low',
      body: 'Add credits so creators keep getting paid for their posts and views.',
      data: {
        event: 'credits_low',
        company_id: companyId,
        deep_link: managerLink(companyId, 'settings'),
      },
    });
  } catch (e) {
    console.error(`credits_low push ${companyId}:`, e);
  }
}

async function notifyPostPaid(
  admin: SupabaseClient,
  params: {
    companyId: string;
    creatorId: string;
    assignmentId: string;
    postId: string;
    amountCents: number;
    /** " Views pay $1 per 1,000." from the company's campaign. */
    viewLine: string;
  },
): Promise<void> {
  try {
    const recipients = await creatorRecipients(
      admin,
      params.creatorId,
      params.companyId,
    );
    await sendPush(admin, recipients, {
      title: 'You got paid for your post',
      body: `${formatCentsDollars(params.amountCents)} is in your balance.${params.viewLine}`,
      data: {
        event: 'bounty_earned',
        company_id: params.companyId,
        deep_link: creatorLink(params.companyId, 'assignment', params.assignmentId),
        assignment_id: params.assignmentId,
        post_id: params.postId,
        amount_cents: String(params.amountCents),
      },
    });
  } catch (e) {
    console.error(`post paid push ${params.postId}:`, e);
  }
}

/** " Views pay $1 per 1,000." for the company's campaign; empty when it pays nothing for views. */
async function viewPayLine(admin: SupabaseClient, companyId: string): Promise<string> {
  const { data, error } = await admin.rpc('company_pay_rates', { p_company_id: companyId });
  if (error || !data) return '';
  const cents = (data as { cents_per_1k_views?: number }).cents_per_1k_views ?? 0;
  return cents > 0 ? ` Views earn ${formatCentsDollars(cents)} per 1,000 for 30 days.` : '';
}

/** One push per creator per poll for view pay on posts already paid their base. */
async function notifyViewsEarned(
  admin: SupabaseClient,
  companyId: string,
  byCreator: Map<string, { cents: number; posts: number; assignmentId: string }>,
): Promise<void> {
  for (const [creatorId, earned] of byCreator) {
    // Under a dollar is noise; it still shows in Earnings.
    if (earned.cents < 100) continue;
    try {
      const recipients = await creatorRecipients(admin, creatorId, companyId);
      await sendPush(admin, recipients, {
        title: 'You got paid for your views',
        body: `${formatCentsDollars(earned.cents)} just hit your wallet.`,
        data: {
          event: 'views_earned',
          company_id: companyId,
          deep_link: `noni://creator/${companyId}/earnings`,
          assignment_id: earned.posts === 1 ? earned.assignmentId : null,
          amount_cents: String(earned.cents),
        },
      });
    } catch (e) {
      console.error(`views earned push ${creatorId}:`, e);
    }
  }
}

type MilestoneClaim = {
  postId: string;
  platform: string | null;
  creatorId: string | null;
  assignmentId: string | null;
  threshold: number;
};

/** Creator push for highest new threshold per post; append bounty if credited. */
async function notifyCreatorMilestones(
  admin: SupabaseClient,
  companyId: string,
  milestoneClaims: MilestoneClaim[],
  assignmentById: Map<string, AssignmentRow>,
): Promise<void> {
  if (milestoneClaims.length === 0) return;

  const topByPost = new Map<string, MilestoneClaim>();
  for (const claim of milestoneClaims) {
    const current = topByPost.get(claim.postId);
    if (!current || claim.threshold > current.threshold) {
      topByPost.set(claim.postId, claim);
    }
  }

  const earnedByPost = new Map<string, number>();
  const legacyPostIds: string[] = [];
  for (const claim of topByPost.values()) {
    if (claim.assignmentId) {
      const a = assignmentById.get(claim.assignmentId);
      if (
        a?.bounty_credited_at != null &&
        a.bounty_amount_cents != null &&
        a.bounty_amount_cents > 0
      ) {
        earnedByPost.set(claim.postId, a.bounty_amount_cents);
      }
    } else {
      legacyPostIds.push(claim.postId);
    }
  }
  if (legacyPostIds.length > 0) {
    const { data: ledger } = await admin
      .from('wallet_ledger')
      .select('post_id, amount_cents')
      .in('post_id', legacyPostIds)
      .eq('kind', 'bounty_credit');
    for (const row of ledger ?? []) {
      if (row.post_id == null) continue;
      earnedByPost.set(row.post_id as string, asInt(row.amount_cents));
    }
  }

  for (const claim of topByPost.values()) {
    if (!claim.creatorId) continue;
    let body = `Your post just hit ${milestoneLabel(claim.threshold)} views.`;
    const earned = earnedByPost.get(claim.postId);
    if (earned != null && earned > 0) {
      body = `Your post just hit ${milestoneLabel(claim.threshold)} views. You earned ${formatCentsDollars(earned)}.`;
    }
    try {
      const creatorRecipientList = await creatorRecipients(
        admin,
        claim.creatorId,
        companyId,
      );
      await sendPush(admin, creatorRecipientList, {
        title: 'Views milestone',
        body,
        data: {
          event: 'milestone',
          company_id: companyId,
          deep_link: creatorLink(companyId, 'posts'),
          post_id: claim.postId,
          assignment_id: claim.assignmentId,
          threshold: String(claim.threshold),
        },
      });
    } catch (e) {
      console.error(`creator milestone push ${claim.postId}:`, e);
    }
  }
}

type PayOutcome = {
  ok: boolean;
  reason?: string | null;
  paid_base_cents?: number;
  paid_view_cents?: number;
};

/**
 * Creator pay: the campaign's rate per post once it reaches the minimum views,
 * plus pay per 1,000 views in the first 30 days up to the cap. The company's
 * budget is debited exactly what the creator earns, no fee (migration 174).
 * pay_assignment is cumulative and idempotent, so calling it every poll pays
 * only what is newly owed and retries a budget shortfall later.
 */
async function payAssignment(
  admin: SupabaseClient,
  assignmentId: string,
  windowViews: number,
  postId: string,
): Promise<PayOutcome> {
  const { data, error } = await admin.rpc('pay_assignment', {
    p_assignment: assignmentId,
    p_views: windowViews,
    p_post_id: postId,
  });
  if (error) {
    console.error(`pay_assignment ${assignmentId}:`, error.message);
    return { ok: false, reason: error.message };
  }
  return (data ?? { ok: false, reason: 'empty response' }) as PayOutcome;
}

type AssignmentRow = {
  id: string;
  creator_id: string;
  task_id: string | null;
  brief_id: string | null;
  post_url: string | null;
  bounty_credited_at: string | null;
  bounty_amount_cents: number | null;
  music_approved_at: string | null;
  publish_at: string | null;
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
  const { data: assignments, error: assignmentsError } = await admin
    .from('assignments')
    .select(
      'id, creator_id, task_id, brief_id, post_url, bounty_credited_at, bounty_amount_cents, music_approved_at, publish_at, metrics',
    )
    .eq('company_id', companyId);
  if (assignmentsError) throw assignmentsError;
  const assignmentById = new Map<string, AssignmentRow>();
  const assignmentByTask = new Map<string, AssignmentRow>();
  for (const raw of (assignments ?? []) as AssignmentRow[]) {
    assignmentById.set(raw.id, raw);
    if (raw.task_id) assignmentByTask.set(raw.task_id, raw);
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
            'id, platform, provider_post_id, post_url, assignment_id, milestones_fired, status, posted_at',
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
    /** When the post went live; null while still scheduled (status pending). */
    liveSince: string | null;
  };
  const pending: PendingPost[] = [];

  for (const raw of assignmentPostsRes.data ?? []) {
    const assignment = assignmentById.get(raw.assignment_id as string) ?? null;
    const postedAt = (raw.posted_at as string | null) ?? null;
    const publishAt = assignment?.publish_at ?? null;
    // posted_at is stamped when the post row is written, which for a
    // scheduled post is before it goes out; the later of the two is the
    // real go-live time the 30-day view window starts from.
    const liveSince = raw.status === 'posted'
      ? [postedAt, publishAt]
          .filter((t): t is string => Boolean(t))
          .sort()
          .at(-1) ?? new Date().toISOString()
      : null;
    pending.push({
      postId: raw.id as string,
      requestId: raw.provider_post_id as string,
      platform: raw.platform as string | null,
      postUrl: raw.post_url as string | null,
      milestonesFired: (raw.milestones_fired as number[] | null) ?? [],
      assignment,
      creatorId: assignment?.creator_id ?? null,
      liveSince,
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
      liveSince: null,
    });
  }

  let polled = 0;
  let credited = 0;
  let skipped = 0;
  let creditsLowNotified = false;
  const rollups = new Map<string, AssignmentRollup>();
  const milestoneClaims: MilestoneClaim[] = [];
  // Per assignment: views inside the pay window, summed across its live
  // platform posts, and the post earnings are attributed to.
  const payable = new Map<string, { windowViews: number; postId: string }>();

  for (const post of pending) {
    const metrics = await fetchPostAnalytics(post.requestId, post.platform);
    if (metrics) {
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
      } else {
        polled += 1;
      }
    } else {
      skipped += 1;
    }

    // Snapshot history (includes the one just written). A failed fetch today
    // still pays from earlier snapshots, and base pay never waits on analytics.
    const { data: history } = await admin
      .from('post_metrics')
      .select('views, fetched_at')
      .eq('post_id', post.postId);
    const snapshots = (history ?? []).map((r) => ({
      views: asInt(r.views),
      at: r.fetched_at as string,
    }));

    if (post.assignment && post.liveSince) {
      const windowEnd =
        new Date(post.liveSince).getTime() + VIEW_WINDOW_DAYS * 24 * 60 * 60 * 1000;
      const windowViews = Math.max(
        0,
        ...snapshots
          .filter((r) => new Date(r.at).getTime() <= windowEnd)
          .map((r) => r.views),
      );
      const entry = payable.get(post.assignment.id) ?? {
        windowViews: 0,
        postId: post.postId,
      };
      entry.windowViews += windowViews;
      payable.set(post.assignment.id, entry);
    }

    if (!metrics) continue;

    // Best views ever seen for this post, so a platform undercount on one
    // poll never hides a crossed milestone.
    const bestViews = Math.max(metrics.views, ...snapshots.map((r) => r.views));

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
      // Roll up into the assignment's displayed metrics.
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
    }
    // Posts with no assignment (pre-campaign legacy tasks) earn nothing under
    // creator pay v2: there is no brief format to price them by.
  }

  // Pay every assignment with a live post: base pay once, view pay as the
  // 30-day count grows. Before the milestone pushes, so they can quote it.
  const viewLine = payable.size > 0 ? await viewPayLine(admin, companyId) : '';
  const viewsEarned = new Map<string, { cents: number; posts: number; assignmentId: string }>();
  for (const [assignmentId, { windowViews, postId }] of payable) {
    const assignment = assignmentById.get(assignmentId);
    if (!assignment) continue;
    const result = await payAssignment(admin, assignmentId, windowViews, postId);
    const paidBase = result.paid_base_cents ?? 0;
    const paidViews = result.paid_view_cents ?? 0;
    if (paidBase + paidViews > 0) {
      credited += 1;
      assignment.bounty_amount_cents =
        (assignment.bounty_amount_cents ?? 0) + paidBase + paidViews;
      assignment.bounty_credited_at ??= new Date().toISOString();
    }
    if (paidBase > 0) {
      await notifyPostPaid(admin, {
        companyId,
        creatorId: assignment.creator_id,
        assignmentId,
        postId,
        amountCents: paidBase + paidViews,
        viewLine,
      });
    } else if (paidViews > 0) {
      const sum = viewsEarned.get(assignment.creator_id) ?? { cents: 0, posts: 0, assignmentId };
      sum.cents += paidViews;
      sum.posts += 1;
      viewsEarned.set(assignment.creator_id, sum);
    }
    if (result.reason === 'insufficient_credits') {
      console.warn(
        `pay_assignment insufficient_credits company=${companyId} assignment=${assignmentId} views=${windowViews}`,
      );
      if (!creditsLowNotified) {
        creditsLowNotified = true;
        await notifyCreditsLow(admin, companyId);
      }
    }
  }

  await notifyViewsEarned(admin, companyId, viewsEarned);

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
    const recipients = await adminRecipients(admin, companyId);
    for (const claim of topByPost.values()) {
      const name = claim.creatorId
        ? (creatorName.get(claim.creatorId) ?? 'A creator')
        : 'A creator';
      const where = claim.platform ? ` on ${claim.platform}` : '';
      try {
        await sendPush(admin, recipients, {
          title: 'Milestone',
          body: `${name}'s post crossed ${milestoneLabel(claim.threshold)} views${where}.`,
          data: {
            post_id: claim.postId,
            assignment_id: claim.assignmentId,
            company_id: companyId,
            event: 'milestone',
            deep_link: claim.assignmentId
              ? managerLink(companyId, 'review', claim.assignmentId)
              : managerLink(companyId, 'analytics'),
          },
        });
      } catch (e) {
        console.error(`milestone push ${claim.postId}:`, e);
      }
    }

  }

  if (rollups.size === 0) {
    await notifyCreatorMilestones(admin, companyId, milestoneClaims, assignmentById);
    return { polled, credited, skipped };
  }

  const revenue = await revenueByAssignment(admin, companyId, assignmentByTask);

  for (const [assignmentId, rollup] of rollups) {
    const assignment = assignmentById.get(assignmentId);
    if (!assignment) continue;

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
    }
  }

  await notifyCreatorMilestones(admin, companyId, milestoneClaims, assignmentById);

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
  if (caller.kind === 'user' && caller.role !== 'campaign_manager') {
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
