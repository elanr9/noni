// Kicks the edit pass (stitch + overlays) for a submission right after the
// creator submits, so the admin reviews the finished video and Approve only
// posts it. Invoked by the creator on submit and by admins to retry a stuck
// or failed job. Responds as soon as the job is claimed; the heavy work
// continues in the background and lands in submissions.render_status.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { handleCors, jsonResponse } from '../_shared/wp8.ts';
import { assembleSubmission, type SubmissionRow } from '../_shared/assemble.ts';
import { MANAGER_MEMBER_ROLES, memberRole } from '../_shared/membership.ts';

declare const EdgeRuntime:
  | { waitUntil(promise: Promise<unknown>): void }
  | undefined;

type Body = { submission_id?: string; resume?: boolean; hop?: number };

const MAX_HOPS = 5;

Deno.serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;
  try {
    const body = (await req.json().catch(() => null)) as Body | null;
    if (!body?.submission_id) {
      return jsonResponse({ error: 'expected { submission_id }' }, 400);
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace('Bearer ', '');
    // The overlay pass is handed to a fresh invocation by this function
    // itself, authenticated with the service role key.
    const internal = token === serviceKey;
    const userId = internal
      ? null
      : (await admin.auth.getUser(token)).data?.user?.id ?? null;
    if (!internal && !userId) return jsonResponse({ error: 'unauthorized' }, 401);

    let platformAdmin = false;
    let isManager = internal;
    if (userId) {
      const { data: caller } = await admin
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .maybeSingle();
      if (!caller) return jsonResponse({ error: 'forbidden' }, 403);
      platformAdmin = caller.role === 'admin';
      isManager = platformAdmin;
    }

    const { data: submission } = await admin
      .from('submissions')
      .select(
        'id, video_path, segment_paths, version, creator_id, assignment_id, task_id, render_status, overlay_render_id, audio_gain, render_timeline',
      )
      .eq('id', body.submission_id)
      .maybeSingle();
    if (!submission) return jsonResponse({ error: 'submission not found' }, 404);

    // Resolve company and brief through the assignment or legacy task.
    let companyId: string | null = null;
    let briefId: string | null = null;
    let targetId: string | null = null;
    if (submission.assignment_id) {
      const { data: assignment } = await admin
        .from('assignments')
        .select('id, company_id, brief_id')
        .eq('id', submission.assignment_id)
        .maybeSingle();
      if (assignment) {
        companyId = assignment.company_id as string;
        briefId = (assignment.brief_id ?? null) as string | null;
        targetId = assignment.id as string;
      }
    } else if (submission.task_id) {
      const { data: task } = await admin
        .from('content_tasks')
        .select('id, company_id')
        .eq('id', submission.task_id)
        .maybeSingle();
      if (task) {
        companyId = task.company_id as string;
        targetId = task.id as string;
      }
    }
    if (!companyId || !targetId) {
      return jsonResponse({ error: 'submission not found' }, 404);
    }
    if (userId && !platformAdmin) {
      const role = await memberRole(admin, userId, companyId);
      if (!role) return jsonResponse({ error: 'submission not found' }, 404);
      isManager = MANAGER_MEMBER_ROLES.includes(role);
    }
    const isOwner = userId !== null && submission.creator_id === userId;
    if (!isOwner && !isManager) {
      return jsonResponse({ error: 'forbidden' }, 403);
    }

    if (submission.render_status === 'ready') {
      return jsonResponse({ status: 'ready' });
    }
    // Photo submissions go through assembleSubmission too: it bakes the
    // admin's text boxes and inset pictures onto each slide.

    // Claim the job. The status filter is the lock: a second invoke while the
    // first is mid-flight ('rendering') becomes a no-op unless the caller is
    // an admin explicitly restarting a stuck job.
    const claimable = isOwner && !isManager
      ? ['queued', 'failed']
      : ['queued', 'failed', 'rendering'];
    const { data: claimed } = await admin
      .from('submissions')
      .update({ render_status: 'rendering', render_error: null })
      .eq('id', submission.id)
      .in('render_status', claimable)
      .select('id')
      .maybeSingle();
    if (!claimed) {
      return jsonResponse({ status: submission.render_status as string });
    }

    // Stitch and overlays each get their own invocation (and wall clock):
    // once the cut is stored this calls itself with resume and the next run
    // picks up from the cut, or from the overlay render still in flight.
    // hop caps the chain so a render that never finishes cannot loop.
    const hop = typeof body.hop === 'number' ? body.hop : 0;
    const handoff = hop >= MAX_HOPS
      ? undefined
      : async () => {
          const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/render-submission`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${serviceKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              submission_id: body.submission_id,
              resume: true,
              hop: hop + 1,
            }),
          });
          return res.ok;
        };

    const job = assembleSubmission({
      admin,
      submission: submission as unknown as SubmissionRow,
      targetId,
      companyId,
      briefId,
      handoff,
    })
      .then((result) => {
        if (result.overlayWarning) console.warn(`render-submission: ${result.overlayWarning}`);
      })
      .catch((error) => {
      console.error('render-submission failed', error);
    });

    if (typeof EdgeRuntime !== 'undefined') {
      EdgeRuntime.waitUntil(job);
      return jsonResponse({ status: 'rendering' }, 202);
    }
    await job;
    return jsonResponse({ status: 'done' });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({ error: message }, 500);
  }
});
