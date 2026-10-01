// Scheduled publish sweep. Approving an assignment stamps publish_at via the
// schedule_assignment_publish RPC; pg_cron hits this every 5 minutes and it
// posts whatever is due through post-approved. Claims via publish_claimed_at
// (update ... where publish_claimed_at is null) so concurrent runs cannot
// double-post. Each tick posts at most one row per company; everything else
// due is re-slotted through schedule_assignment_publish_system, which also
// handles every deferral and retry so nothing lands outside the 9am to 9pm ET
// window or on top of another post. Failures retry up to three attempts and
// then stay claimed with publish_error set for a manager to see.

import { adminClient, authenticate, handleCors, jsonResponse } from '../_shared/wp8.ts';

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

type Admin = ReturnType<typeof adminClient>;

type DueRow = {
  id: string;
  company_id: string;
  brief_id: string | null;
  creator_id: string;
  publish_at: string;
  publish_attempts: number;
};

/** Minimum gap between two creators posting the same brief. Identical text
 *  slideshows landing on several accounts within minutes reads as
 *  mass-produced content to TikTok and every copy gets pulled. */
const SAME_BRIEF_GAP_MS = 24 * 60 * 60 * 1000;

/** Minimum gap between two posts from the same creator account. A backlog
 *  approved in one sitting used to fire every post inside one tick. */
const SAME_CREATOR_GAP_MS = 90 * 60 * 1000;

const MAX_PUBLISH_ATTEMPTS = 3;

/** Re-slots the assignment on a later day and releases any claim. */
async function defer(admin: Admin, row: DueRow): Promise<void> {
  const { error } = await admin.rpc('schedule_assignment_publish_system', {
    p_assignment_id: row.id,
  });
  if (error) console.error('publish-due defer error:', row.id, error.message);
  await admin
    .from('assignments')
    .update({ publish_claimed_at: null })
    .eq('id', row.id)
    .eq('company_id', row.company_id);
}

/**
 * When this creator posted anything inside the gap, re-slot this assignment
 * and report true so the sweep skips it this tick.
 */
async function deferIfCreatorRecentlyPosted(admin: Admin, row: DueRow): Promise<boolean> {
  const since = new Date(Date.now() - SAME_CREATOR_GAP_MS).toISOString();
  const { data } = await admin
    .from('posts')
    .select('posted_at, assignments!inner(id, creator_id, company_id)')
    .eq('assignments.creator_id', row.creator_id)
    .eq('assignments.company_id', row.company_id)
    .neq('assignments.id', row.id)
    .gte('posted_at', since)
    .order('posted_at', { ascending: false })
    .limit(1);
  const latest = (data ?? [])[0] as { posted_at: string | null } | undefined;
  if (!latest?.posted_at) return false;
  await defer(admin, row);
  return true;
}

/**
 * When another creator posted this brief inside the gap, re-slot this
 * assignment and report true so the sweep skips it this tick.
 */
async function deferIfBriefRecentlyPosted(admin: Admin, row: DueRow): Promise<boolean> {
  if (!row.brief_id) return false;
  const since = new Date(Date.now() - SAME_BRIEF_GAP_MS).toISOString();
  const { data } = await admin
    .from('posts')
    .select('posted_at, assignments!inner(id, brief_id, company_id)')
    .eq('assignments.brief_id', row.brief_id)
    .eq('assignments.company_id', row.company_id)
    .neq('assignments.id', row.id)
    .gte('posted_at', since)
    .order('posted_at', { ascending: false })
    .limit(1);
  const latest = (data ?? [])[0] as { posted_at: string | null } | undefined;
  if (!latest?.posted_at) return false;
  await defer(admin, row);
  return true;
}

type PublishOutcome =
  | { ok: true }
  | { ok: false; status: number; message: string };

async function publish(assignmentId: string): Promise<PublishOutcome> {
  const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/post-approved`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-cron-secret': Deno.env.get('CRON_SECRET') ?? '',
    },
    body: JSON.stringify({ assignment_id: assignmentId }),
  });
  const json = (await res.json().catch(() => null)) as { error?: string } | null;
  if (!res.ok || json?.error) {
    return {
      ok: false,
      status: res.status,
      message: json?.error ?? `post-approved returned ${res.status}`,
    };
  }
  return { ok: true };
}

/**
 * Records a failed attempt. Under the cap a 5xx releases the claim for the
 * next tick and anything else is re-slotted on a later day; at the cap the
 * row stays claimed with the error so a manager can step in.
 */
async function recordFailure(admin: Admin, row: DueRow, outcome: PublishOutcome): Promise<void> {
  if (outcome.ok) return;
  const attempts = row.publish_attempts + 1;
  const exhausted = attempts >= MAX_PUBLISH_ATTEMPTS;
  if (!exhausted && outcome.status < 500) await defer(admin, row);
  const { error } = await admin
    .from('assignments')
    .update({
      publish_error: outcome.message,
      ...(exhausted ? {} : { publish_claimed_at: null }),
    })
    .eq('id', row.id)
    .eq('company_id', row.company_id);
  if (error) console.error('publish-due mark error:', row.id, error.message);
}

type PendingPost = {
  id: string;
  assignment_id: string | null;
  platform: string;
  provider_post_id: string | null;
  assignments: { company_id: string } | null;
};

type StatusRow = {
  platform?: string;
  success?: boolean;
  post_url?: string | null;
  error_message?: string | null;
  status?: string;
};

async function reconcilePending(admin: Admin): Promise<void> {
  const apiKey = Deno.env.get('UPLOAD_POST_API_KEY');
  if (!apiKey) return;
  const { data } = await admin
    .from('posts')
    .select('id, assignment_id, platform, provider_post_id, assignments(company_id)')
    .eq('status', 'pending')
    .not('provider_post_id', 'is', null)
    .limit(40);
  const pending = (data ?? []) as unknown as PendingPost[];
  const byRequest = new Map<string, PendingPost[]>();
  for (const p of pending) {
    if (!p.provider_post_id) continue;
    byRequest.set(p.provider_post_id, [...(byRequest.get(p.provider_post_id) ?? []), p]);
  }
  for (const [requestId, posts] of byRequest) {
    try {
      const res = await fetch(
        `https://api.upload-post.com/api/uploadposts/status?request_id=${encodeURIComponent(requestId)}`,
        { headers: { Authorization: `Apikey ${apiKey}` } },
      );
      if (!res.ok) continue;
      const json = (await res.json()) as { status?: string; results?: StatusRow[] | Record<string, StatusRow> };
      const rows: StatusRow[] = Array.isArray(json.results)
        ? json.results
        : Object.entries(json.results ?? {}).map(([platform, r]) => ({ platform, ...r }));
      for (const post of posts) {
        const r = rows.find((x) => x.platform === post.platform);
        if (!r) continue;
        const state = (r.status ?? '').toLowerCase();
        const inFlight = ['processing', 'pending', 'queued', 'running', 'retrying'].includes(state);
        if (inFlight) continue;
        const posted = r.success === true || Boolean(r.post_url);
        const failed = !posted && (r.success === false || Boolean(r.error_message));
        if (!posted && !failed) continue;
        await admin
          .from('posts')
          .update({
            status: posted ? 'posted' : 'failed',
            post_url: r.post_url ?? null,
          })
          .eq('id', post.id);
        if (posted && post.assignment_id && post.assignments && r.post_url) {
          await admin
            .from('assignments')
            .update({ post_url: r.post_url })
            .eq('id', post.assignment_id)
            .eq('company_id', post.assignments.company_id)
            .is('post_url', null);
        }
      }
    } catch (e) {
      console.error('publish-due reconcile error:', requestId, e);
    }
  }
}

/** Files a finished post no longer needs: raw takes, cuts and scratch. */
const DISPOSABLE = /(^draft-.*\.mp4$|-edited\.mp4$|-composited\.(mp4|png)$|-gs-\d+\.mp4$|-norm-\d+\.mp4$|\.graph$|\.text\d+$|-overlay\.ass$|^\d+-slide-\d+\.(jpe?g|png|heic|webp)$)/i;

/**
 * Deletes the raw takes and intermediate renders of assignments whose every
 * platform is posted, keeping the finished video and slides for playback.
 */
async function cleanPostedStorage(admin: Admin): Promise<void> {
  const { data } = await admin
    .from('assignments')
    .select('id, company_id, posts(status)')
    .eq('status', 'posted')
    .is('storage_cleaned_at', null)
    .limit(20);
  type Row = { id: string; company_id: string; posts: Array<{ status: string }> };
  for (const row of (data ?? []) as Row[]) {
    if (row.posts.length === 0 || row.posts.some((p) => p.status !== 'posted')) continue;
    const folder = `${row.company_id}/${row.id}`;
    try {
      const { data: files } = await admin.storage.from('videos').list(folder, { limit: 500 });
      const doomed = (files ?? [])
        .map((f) => f.name)
        .filter((name) => DISPOSABLE.test(name))
        .map((name) => `${folder}/${name}`);
      if (doomed.length > 0) await admin.storage.from('videos').remove(doomed);
      await admin
        .from('assignments')
        .update({ storage_cleaned_at: new Date().toISOString() })
        .eq('id', row.id)
        .eq('company_id', row.company_id);
    } catch (e) {
      console.error('publish-due cleanup error:', row.id, e);
    }
  }
}

async function notifyPostLive(assignmentId: string): Promise<void> {
  try {
    await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/notify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-cron-secret': Deno.env.get('CRON_SECRET') ?? '',
      },
      body: JSON.stringify({ assignment_id: assignmentId, event: 'post_live' }),
    });
  } catch (e) {
    console.error('publish-due notify error:', assignmentId, e);
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

  try {
    const dueQuery = admin
      .from('assignments')
      .select('id, company_id, brief_id, creator_id, publish_at, publish_attempts')
      .eq('status', 'approved')
      .lte('publish_at', new Date().toISOString())
      .is('publish_claimed_at', null);
    const scoped = caller.kind === 'user' ? dueQuery.eq('company_id', caller.companyId) : dueQuery;
    const { data: due, error } = await scoped.order('publish_at', { ascending: true }).limit(10);
    if (error) throw new Error(error.message);
    const rows = (due ?? []) as DueRow[];

    const claimed: DueRow[] = [];
    // One post per company, one creator per brief and one post per creator
    // per sweep: the earliest claimant posts and the rest are re-slotted.
    const companiesClaimedThisTick = new Set<string>();
    const briefsClaimedThisTick = new Set<string>();
    const creatorsClaimedThisTick = new Set<string>();
    for (const row of rows) {
      const blocked =
        companiesClaimedThisTick.has(row.company_id) ||
        (row.brief_id !== null && briefsClaimedThisTick.has(row.brief_id)) ||
        creatorsClaimedThisTick.has(row.creator_id);
      if (blocked) {
        await defer(admin, row);
        continue;
      }
      if (await deferIfBriefRecentlyPosted(admin, row)) continue;
      if (await deferIfCreatorRecentlyPosted(admin, row)) continue;
      const { data: claimedRows } = await admin
        .from('assignments')
        .update({
          publish_claimed_at: new Date().toISOString(),
          publish_attempts: row.publish_attempts + 1,
        })
        .eq('id', row.id)
        .eq('company_id', row.company_id)
        .is('publish_claimed_at', null)
        .select('id');
      if (claimedRows && claimedRows.length > 0) {
        claimed.push(row);
        companiesClaimedThisTick.add(row.company_id);
        if (row.brief_id) briefsClaimedThisTick.add(row.brief_id);
        creatorsClaimedThisTick.add(row.creator_id);
      }
    }

    // Upload-Post polling can take a minute per post; the cron client times
    // out at 10s, so the work runs after the response.
    EdgeRuntime.waitUntil(
      Promise.allSettled(
        claimed.map(async (row) => {
          const outcome = await publish(row.id);
          if (outcome.ok) {
            await notifyPostLive(row.id);
            return;
          }
          console.error('publish-due post-approved error:', row.id, outcome.status, outcome.message);
          await recordFailure(admin, row, outcome);
        }),
      ),
    );

    // Posts left 'pending' when the approve-time poll ran out: ask Upload-Post
    // how each request ended and record the live URL or the failure. Then
    // free the storage of posts that are live everywhere.
    EdgeRuntime.waitUntil(reconcilePending(admin).then(() => cleanPostedStorage(admin)));

    return jsonResponse({ due: rows.length, claimed: claimed.length });
  } catch (e) {
    console.error('publish-due error:', e);
    return jsonResponse(
      { error: e instanceof Error ? e.message : 'publish-due failed' },
      500,
    );
  }
});
