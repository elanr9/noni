// Scheduled publish sweep. Approving an assignment stamps publish_at via the
// schedule_assignment_publish RPC; pg_cron hits this every 5 minutes and it
// posts whatever is due through post-approved. Claims via publish_claimed_at
// (update ... where publish_claimed_at is null) so concurrent runs cannot
// double-post. A 5xx from post-approved releases the claim so the next tick
// retries; anything else keeps it claimed with publish_error set so a broken
// row does not loop forever.

import { adminClient, authenticate, handleCors, jsonResponse } from '../_shared/wp8.ts';

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

type DueRow = { id: string; company_id: string };

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
      .select('id, company_id')
      .eq('status', 'approved')
      .lte('publish_at', new Date().toISOString())
      .is('publish_claimed_at', null)
      .order('publish_at', { ascending: true })
      .limit(10);
    if (error) throw new Error(error.message);
    const rows = (due ?? []) as DueRow[];

    const claimedIds: string[] = [];
    for (const row of rows) {
      const { data: claimedRows } = await admin
        .from('assignments')
        .update({ publish_claimed_at: new Date().toISOString() })
        .eq('id', row.id)
        .is('publish_claimed_at', null)
        .select('id');
      if (claimedRows && claimedRows.length > 0) claimedIds.push(row.id);
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

    return jsonResponse({ due: rows.length, claimed: claimedIds.length });
  } catch (e) {
    console.error('publish-due error:', e);
    return jsonResponse(
      { error: e instanceof Error ? e.message : 'publish-due failed' },
      500,
    );
  }
});
