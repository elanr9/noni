// Scheduled publish sweep. Approving an assignment stamps publish_at via the
// schedule_assignment_publish RPC; pg_cron hits this every 5 minutes and it
// posts whatever is due through post-approved. Claims via publish_claimed_at
// (update ... where publish_claimed_at is null) so concurrent runs cannot
// double-post. A 5xx from post-approved releases the claim so the next tick
// retries; anything else keeps it claimed with publish_error set so a broken
// row does not loop forever.

import { adminClient, authenticate, handleCors, jsonResponse } from '../_shared/wp8.ts';

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

type DueRow = {
  id: string;
  company_id: string;
  brief_id: string | null;
  creator_id: string;
  publish_at: string;
};

/** Minimum gap between two creators posting the same brief. Identical text
 *  slideshows landing on several accounts within minutes reads as
 *  mass-produced content to TikTok and every copy gets pulled. */
const SAME_BRIEF_GAP_MS = 24 * 60 * 60 * 1000;

/** Minimum gap between two posts from the same creator account. A backlog
 *  approved in one sitting used to fire every post inside one tick. */
const SAME_CREATOR_GAP_MS = 90 * 60 * 1000;

/** Random spread added to every deferral so pushed posts do not reconverge. */
function jitterMs(): number {
  return Math.floor(Math.random() * 25 * 60 * 1000);
}

/**
 * When this creator posted anything inside the gap, push this assignment
 * past gap-end and report true so the sweep skips it this tick.
 */
async function deferIfCreatorRecentlyPosted(
  admin: ReturnType<typeof adminClient>,
  row: DueRow,
): Promise<boolean> {
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
  const nextAt = new Date(new Date(latest.posted_at).getTime() + SAME_CREATOR_GAP_MS + jitterMs());
  await admin
    .from('assignments')
    .update({ publish_at: nextAt.toISOString() })
    .eq('id', row.id)
    .is('publish_claimed_at', null);
  return true;
}

/**
 * When another creator posted this brief inside the gap, push this
 * assignment to gap-end and report true so the sweep skips it this tick.
 */
async function deferIfBriefRecentlyPosted(
  admin: ReturnType<typeof adminClient>,
  row: DueRow,
): Promise<boolean> {
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
  const nextAt = new Date(new Date(latest.posted_at).getTime() + SAME_BRIEF_GAP_MS + jitterMs());
  await admin
    .from('assignments')
    .update({ publish_at: nextAt.toISOString() })
    .eq('id', row.id)
    .is('publish_claimed_at', null);
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

type PendingPost = {
  id: string;
  assignment_id: string | null;
  platform: string;
  provider_post_id: string | null;
};

type StatusRow = {
  platform?: string;
  success?: boolean;
  post_url?: string | null;
  error_message?: string | null;
  status?: string;
};

async function reconcilePending(admin: ReturnType<typeof adminClient>): Promise<void> {
  const apiKey = Deno.env.get('UPLOAD_POST_API_KEY');
  if (!apiKey) return;
  const { data } = await admin
    .from('posts')
    .select('id, assignment_id, platform, provider_post_id')
    .eq('status', 'pending')
    .not('provider_post_id', 'is', null)
    .limit(40);
  const pending = (data ?? []) as PendingPost[];
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
        if (posted && post.assignment_id && r.post_url) {
          await admin
            .from('assignments')
            .update({ post_url: r.post_url })
            .eq('id', post.assignment_id)
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
async function cleanPostedStorage(admin: ReturnType<typeof adminClient>): Promise<void> {
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
        .eq('id', row.id);
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
    const { data: due, error } = await admin
      .from('assignments')
      .select('id, company_id, brief_id, creator_id, publish_at')
      .eq('status', 'approved')
      .lte('publish_at', new Date().toISOString())
      .is('publish_claimed_at', null)
      .order('publish_at', { ascending: true })
      .limit(10);
    if (error) throw new Error(error.message);
    const rows = (due ?? []) as DueRow[];

    const claimedIds: string[] = [];
    // One creator per brief and one post per creator per sweep: the first
    // claimant makes the rest wait out their gap on a later tick.
    const briefsClaimedThisTick = new Set<string>();
    const creatorsClaimedThisTick = new Set<string>();
    for (const row of rows) {
      if (row.brief_id && briefsClaimedThisTick.has(row.brief_id)) {
        await admin
          .from('assignments')
          .update({ publish_at: new Date(Date.now() + SAME_BRIEF_GAP_MS + jitterMs()).toISOString() })
          .eq('id', row.id)
          .is('publish_claimed_at', null);
        continue;
      }
      if (creatorsClaimedThisTick.has(row.creator_id)) {
        await admin
          .from('assignments')
          .update({ publish_at: new Date(Date.now() + SAME_CREATOR_GAP_MS + jitterMs()).toISOString() })
          .eq('id', row.id)
          .is('publish_claimed_at', null);
        continue;
      }
      if (await deferIfBriefRecentlyPosted(admin, row)) continue;
      if (await deferIfCreatorRecentlyPosted(admin, row)) continue;
      const { data: claimedRows } = await admin
        .from('assignments')
        .update({ publish_claimed_at: new Date().toISOString() })
        .eq('id', row.id)
        .is('publish_claimed_at', null)
        .select('id');
      if (claimedRows && claimedRows.length > 0) {
        claimedIds.push(row.id);
        if (row.brief_id) briefsClaimedThisTick.add(row.brief_id);
        creatorsClaimedThisTick.add(row.creator_id);
      }
    }

    // Upload-Post polling can take a minute per post; the cron client times
    // out at 10s, so the work runs after the response.
    EdgeRuntime.waitUntil(
      Promise.allSettled(
        claimedIds.map(async (id) => {
          const outcome = await publish(id);
          if (outcome.ok) {
            await notifyPostLive(id);
            return;
          }
          console.error('publish-due post-approved error:', id, outcome.status, outcome.message);
          const retry = outcome.status >= 500;
          const { error: markError } = await admin
            .from('assignments')
            .update({
              publish_error: outcome.message,
              ...(retry ? { publish_claimed_at: null } : {}),
            })
            .eq('id', id);
          if (markError) console.error('publish-due mark error:', id, markError.message);
        }),
      ),
    );

    // Posts left 'pending' when the approve-time poll ran out: ask Upload-Post
    // how each request ended and record the live URL or the failure. Then
    // free the storage of posts that are live everywhere.
    EdgeRuntime.waitUntil(reconcilePending(admin).then(() => cleanPostedStorage(admin)));

    return jsonResponse({ due: rows.length, claimed: claimedIds.length });
  } catch (e) {
    console.error('publish-due error:', e);
    return jsonResponse(
      { error: e instanceof Error ? e.message : 'publish-due failed' },
      500,
    );
  }
});
