import { createClient } from 'npm:@supabase/supabase-js@2';
import { handleCors, jsonResponse } from '../_shared/wp8.ts';
import {
  assembleSubmission,
  uploadPostKey,
  type AdminClient,
} from '../_shared/assemble.ts';

type PostApprovedBody = { assignment_id?: string; task_id?: string };

// What we post, independent of whether the caller keyed by assignment
// (campaign-published) or by legacy content_task (backfilled rows).
type PostTarget = {
  /** assignment id or task id; also keys storage paths. */
  id: string;
  companyId: string;
  creatorId: string;
  caption: string;
  platforms: string[];
  assignmentId: string | null;
  taskId: string | null;
  /** Set on assignment targets; overlays render only when the brief has segments. */
  briefId: string | null;
  /** Photo carousel briefs post their slides via upload_photos, not video. */
  isSlideshow: boolean;
};

type PlatformResult = {
  success?: boolean;
  url?: string;
  error?: string;
  post_id?: string;
};

async function pollStatus(
  requestId: string,
  apiKey: string,
): Promise<Record<string, PlatformResult>> {
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const res = await fetch(
      `https://api.upload-post.com/api/uploadposts/status?request_id=${encodeURIComponent(requestId)}`,
      { headers: { Authorization: `Apikey ${apiKey}` } },
    );
    const data = (await res.json()) as {
      status?: string;
      results?: Record<string, PlatformResult>;
    };
    if (data.results && (data.status === 'completed' || data.status === 'done')) {
      return data.results;
    }
    if (data.results && Object.keys(data.results).length > 0 && i > 5) {
      const pending = Object.values(data.results).some(
        (r) => r.success === undefined && !r.error && !r.url,
      );
      if (!pending) return data.results;
    }
  }
  throw new Error('Upload-Post status poll timed out');
}

async function resolveTarget(
  admin: AdminClient,
  body: PostApprovedBody,
  callerCompanyId: string,
): Promise<PostTarget | Response> {
  if (body.assignment_id) {
    const { data: assignment } = await admin
      .from('assignments')
      .select('id, company_id, creator_id, brief_id, status, submission_id, task_id')
      .eq('id', body.assignment_id)
      .maybeSingle();
    if (!assignment || assignment.company_id !== callerCompanyId) {
      return jsonResponse({ error: 'assignment not found' }, 404);
    }
    if (assignment.status !== 'approved') {
      return jsonResponse(
        { error: `assignment status is ${assignment.status}, need approved` },
        409,
      );
    }
    const { data: brief } = await admin
      .from('briefs')
      .select('title, caption, format, post_type_id')
      .eq('id', assignment.brief_id)
      .maybeSingle();
    return {
      id: assignment.id as string,
      companyId: assignment.company_id as string,
      creatorId: assignment.creator_id as string,
      caption: (brief?.caption ?? brief?.title ?? 'New post') as string,
      platforms: ['tiktok', 'instagram'],
      assignmentId: assignment.id as string,
      taskId: (assignment.task_id ?? null) as string | null,
      briefId: assignment.brief_id as string,
      isSlideshow: brief?.format === 'photo_carousel',
    };
  }

  const { data: task } = await admin
    .from('content_tasks')
    .select('id, title, caption, platforms, company_id, status, assigned_to')
    .eq('id', body.task_id)
    .maybeSingle();
  if (!task || task.company_id !== callerCompanyId) {
    return jsonResponse({ error: 'task not found' }, 404);
  }
  if (task.status !== 'approved') {
    return jsonResponse(
      { error: `task status is ${task.status}, need approved` },
      409,
    );
  }
  if (!task.assigned_to) {
    return jsonResponse({ error: 'task has no assigned creator' }, 400);
  }
  const { data: mirror } = await admin
    .from('assignments')
    .select('id')
    .eq('task_id', task.id)
    .maybeSingle();
  const platforms = ((task.platforms ?? ['tiktok', 'instagram']) as unknown[]).filter(
    (p): p is string => typeof p === 'string' && p.length > 0,
  );
  return {
    id: task.id as string,
    companyId: task.company_id as string,
    creatorId: task.assigned_to as string,
    caption: (task.caption ?? task.title) as string,
    platforms,
    assignmentId: (mirror?.id ?? null) as string | null,
    taskId: task.id as string,
    briefId: null,
    isSlideshow: false,
  };
}

// Latest submission for the target. Assignments prefer their pinned
// submission_id (backfilled rows point at task-keyed submissions).
async function resolveSubmission(
  admin: AdminClient,
  target: PostTarget,
): Promise<{ id: string; video_path: string | null; segment_paths: string[] | null; version: number | null; render_status: string | null } | null> {
  type Row = {
    id: string;
    video_path: string | null;
    segment_paths: string[] | null;
    version: number | null;
    render_status: string | null;
  };
  if (target.assignmentId) {
    const { data: assignment } = await admin
      .from('assignments')
      .select('submission_id')
      .eq('id', target.assignmentId)
      .maybeSingle();
    if (assignment?.submission_id) {
      const { data } = await admin
        .from('submissions')
        .select('id, video_path, segment_paths, version, render_status')
        .eq('id', assignment.submission_id)
        .maybeSingle();
      if (data) return data as Row;
    }
    const { data } = await admin
      .from('submissions')
      .select('id, video_path, segment_paths, version, render_status')
      .eq('assignment_id', target.assignmentId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) return data as Row;
  }
  if (target.taskId) {
    const { data } = await admin
      .from('submissions')
      .select('id, video_path, segment_paths, version, render_status')
      .eq('task_id', target.taskId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) return data as Row;
  }
  return null;
}

Deno.serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;
  try {
    const body = (await req.json().catch(() => null)) as PostApprovedBody | null;
    if (!body?.assignment_id && !body?.task_id) {
      return jsonResponse({ error: 'expected { assignment_id } or { task_id }' }, 400);
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
    // Platform admin (role admin) inherits campaign manager powers.
    if (!caller || (caller.role !== 'campaign_manager' && caller.role !== 'admin')) {
      return jsonResponse({ error: 'forbidden' }, 403);
    }

    const resolved = await resolveTarget(admin, body, caller.company_id as string);
    if (resolved instanceof Response) return resolved;
    const target = resolved;

    const { data: creator } = await admin
      .from('profiles')
      .select('id, full_name, upload_post_profile')
      .eq('id', target.creatorId)
      .maybeSingle();
    if (!creator?.upload_post_profile) {
      return jsonResponse(
        {
          error:
            'Creator has not connected socials yet. They need to link TikTok/Instagram in Settings before you can post.',
          creator_id: target.creatorId,
          creator_name: creator?.full_name ?? null,
        },
        400,
      );
    }

    const submission = await resolveSubmission(admin, target);
    if (!submission?.video_path) {
      return jsonResponse({ error: 'no submission video' }, 400);
    }

    const apiKey = uploadPostKey();

    const platforms = target.platforms;
    if (platforms.length === 0) {
      return jsonResponse({ error: 'no platforms to post to' }, 400);
    }

    const form = new FormData();
    form.append('user', creator.upload_post_profile);
    form.append('title', target.caption);
    form.append('async_upload', 'true');
    for (const p of platforms) form.append('platform[]', p);

    let overlayWarning: string | null = null;
    let uploadUrl = 'https://api.upload-post.com/api/upload';

    if (target.isSlideshow) {
      // Slideshow: the slides in segment_paths post as a photo carousel
      // (TikTok photo post + Instagram carousel). Trending music is layered
      // on afterwards through the existing music approval loop.
      uploadUrl = 'https://api.upload-post.com/api/upload_photos';
      const slidePaths = (submission.segment_paths ?? []) as string[];
      if (slidePaths.length === 0) {
        return jsonResponse({ error: 'submission has no slides' }, 400);
      }
      for (const path of slidePaths) {
        const { data: slide, error: slideError } = await admin.storage
          .from('videos')
          .createSignedUrl(path, 3600);
        if (slideError || !slide?.signedUrl) {
          return jsonResponse(
            { error: 'could not sign slide url', detail: slideError?.message },
            500,
          );
        }
        form.append('photos[]', slide.signedUrl);
      }
    } else {
      // The edit pass (stitch + overlays) runs at submit time now, via the
      // render-submission function, so the admin approved the finished file.
      // Assemble here only as a fallback for legacy submissions that were
      // never rendered.
      let videoPath = submission.video_path as string;
      if (submission.render_status !== 'ready') {
        try {
          const assembled = await assembleSubmission({
            admin,
            submission: {
              id: submission.id as string,
              video_path: submission.video_path as string,
              segment_paths: (submission.segment_paths ?? null) as string[] | null,
              version: (submission.version ?? null) as number | null,
            },
            targetId: target.id,
            companyId: target.companyId,
            briefId: target.briefId,
          });
          videoPath = assembled.videoPath;
          overlayWarning = assembled.overlayWarning;
        } catch (assembleError) {
          const detail =
            assembleError instanceof Error
              ? assembleError.message
              : String(assembleError);
          return jsonResponse({ error: 'edit pass failed', detail }, 502);
        }
      }

      const { data: signed, error: signError } = await admin.storage
        .from('videos')
        .createSignedUrl(videoPath, 3600);
      if (signError || !signed?.signedUrl) {
        return jsonResponse(
          { error: 'could not sign video url', detail: signError?.message },
          500,
        );
      }
      form.append('video', signed.signedUrl);
    }

    const uploadRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: { Authorization: `Apikey ${apiKey}` },
      body: form,
    });
    const uploadJson = (await uploadRes.json()) as {
      success?: boolean;
      request_id?: string;
      results?: Record<string, PlatformResult>;
      message?: string;
      error?: string;
    };
    if (!uploadRes.ok || uploadJson.success === false) {
      return jsonResponse(
        {
          error: 'upload-post failed',
          detail: uploadJson.message ?? uploadJson.error ?? uploadJson,
        },
        502,
      );
    }

    let results = uploadJson.results ?? {};
    const requestId = uploadJson.request_id ?? null;
    if (requestId && Object.keys(results).length === 0) {
      results = await pollStatus(requestId, apiKey);
    }

    const postRows: Array<{
      task_id: string | null;
      assignment_id: string | null;
      submission_id: string;
      platform: string;
      provider_post_id: string | null;
      post_url: string | null;
      status: string;
    }> = [];

    for (const platform of platforms) {
      const r = results[platform];
      postRows.push({
        task_id: target.taskId,
        assignment_id: target.assignmentId,
        submission_id: submission.id,
        platform,
        provider_post_id: requestId ?? r?.post_id ?? null,
        post_url: r?.url ?? null,
        status: r?.success === false ? 'failed' : r?.url ? 'posted' : 'pending',
      });
    }

    if (postRows.length > 0) {
      const { error: postsError } = await admin.from('posts').insert(postRows);
      if (postsError) {
        return jsonResponse(
          { error: 'failed to write posts', detail: postsError.message },
          500,
        );
      }
    }

    const anyPosted = postRows.some(
      (p) => p.status === 'posted' || p.status === 'pending',
    );
    if (anyPosted) {
      const liveUrl = postRows.find((p) => p.post_url !== null)?.post_url ?? null;
      if (target.assignmentId) {
        const { error: statusError } = await admin
          .from('assignments')
          .update({ status: 'posted', post_url: liveUrl })
          .eq('id', target.assignmentId)
          .eq('status', 'approved');
        if (statusError) {
          return jsonResponse(
            {
              error: 'posts written but assignment status flip failed',
              detail: statusError.message,
            },
            500,
          );
        }
      }
      if (target.taskId) {
        const { error: statusError } = await admin
          .from('content_tasks')
          .update({ status: 'posted' })
          .eq('id', target.taskId)
          .eq('status', 'approved');
        if (statusError) {
          return jsonResponse(
            {
              error: 'posts written but task status flip failed',
              detail: statusError.message,
            },
            500,
          );
        }
      }
    }

    return jsonResponse({
      request_id: requestId,
      assignment_id: target.assignmentId,
      creator_id: creator.id,
      upload_post_profile: creator.upload_post_profile,
      posts: postRows,
      results,
      overlay_warning: overlayWarning,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({ error: message }, 500);
  }
});
