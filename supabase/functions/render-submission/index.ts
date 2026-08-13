// Kicks the edit pass (stitch + overlays) for a submission right after the
// creator submits, so the admin reviews the finished video and Approve only
// posts it. Invoked by the creator on submit and by admins to retry a stuck
// or failed job. Responds as soon as the job is claimed; the heavy work
// continues in the background and lands in submissions.render_status.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { handleCors, jsonResponse } from '../_shared/wp8.ts';
import { assembleSubmission, type SubmissionRow } from '../_shared/assemble.ts';

declare const EdgeRuntime:
  | { waitUntil(promise: Promise<unknown>): void }
  | undefined;

type Body = { submission_id?: string };

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

    const authHeader = req.headers.get('Authorization') ?? '';
    const { data: userData } = await admin.auth.getUser(
      authHeader.replace('Bearer ', ''),
    );
    if (!userData?.user) return jsonResponse({ error: 'unauthorized' }, 401);

    const { data: caller } = await admin
      .from('profiles')
      .select('company_id, role')
      .eq('id', userData.user.id)
      .maybeSingle();
    if (!caller) return jsonResponse({ error: 'forbidden' }, 403);
    // Platform admin (role admin) inherits campaign manager powers.
    const isManager =
      caller.role === 'campaign_manager' || caller.role === 'admin';

    const { data: submission } = await admin
      .from('submissions')
      .select(
        'id, video_path, segment_paths, version, creator_id, assignment_id, task_id, render_status',
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
    if (!companyId || !targetId || companyId !== caller.company_id) {
      return jsonResponse({ error: 'submission not found' }, 404);
    }
    const isOwner = submission.creator_id === userData.user.id;
    if (!isOwner && !isManager) {
      return jsonResponse({ error: 'forbidden' }, 403);
    }

    if (submission.render_status === 'ready') {
      return jsonResponse({ status: 'ready' });
    }

    // Photo submissions have nothing to stitch.
    const videoPath = (submission.video_path ?? '') as string;
    if (!videoPath.endsWith('.mp4') && !videoPath.endsWith('.mov')) {
      await admin
        .from('submissions')
        .update({ render_status: 'ready', render_error: null })
        .eq('id', submission.id);
      return jsonResponse({ status: 'ready' });
    }

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

    const job = assembleSubmission({
      admin,
      submission: submission as unknown as SubmissionRow,
      targetId,
      companyId,
      briefId,
    }).catch((error) => {
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
