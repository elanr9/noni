import { createClient } from 'npm:@supabase/supabase-js@2';
import { handleCors, jsonResponse } from '../_shared/wp8.ts';
import {
  assembleSubmission,
  ensureInstagramSlides,
  uploadPostKey,
  type AdminClient,
} from '../_shared/assemble.ts';
import { isManagerOf } from '../_shared/membership.ts';

type PostApprovedBody = {
  assignment_id?: string;
  task_id?: string;
  /** Cron only: re-send an already posted assignment to just these platforms. */
  repost_platforms?: string[];
};

const SUPPORTED_PLATFORMS = ['tiktok', 'instagram'];

/** null means the cron caller: no tenant restriction. */
type ManagerCaller = { userId: string; platformAdmin: boolean } | null;

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

/**
 * Upload-Post returns `results` either keyed by platform (sync uploads) or as
 * an array of per-platform rows with post_url / platform_post_id /
 * error_message (status endpoint). Normalise to one shape keyed by platform.
 */
export function normalizeResults(raw: unknown): Record<string, PlatformResult> {
  const out: Record<string, PlatformResult> = {};
  const rows: unknown[] = Array.isArray(raw)
    ? raw
    : typeof raw === 'object' && raw !== null
      ? Object.entries(raw as Record<string, unknown>).map(([platform, value]) =>
          typeof value === 'object' && value !== null ? { platform, ...(value as object) } : { platform },
        )
      : [];
  for (const row of rows) {
    if (typeof row !== 'object' || row === null) continue;
    const r = row as Record<string, unknown>;
    const platform = typeof r.platform === 'string' ? r.platform : null;
    if (!platform) continue;
    // Status rows carry success:false while still processing; only a
    // terminal status (or a url / error) decides the outcome.
    const state = typeof r.status === 'string' ? r.status.toLowerCase() : null;
    const inFlight =
      state !== null && ['processing', 'pending', 'queued', 'running', 'retrying'].includes(state);
    if (inFlight) {
      out[platform] = {};
      continue;
    }
    const url = [r.url, r.post_url].find((v): v is string => typeof v === 'string' && v.length > 0);
    const error = [r.error, r.error_message].find(
      (v): v is string => typeof v === 'string' && v.length > 0,
    );
    const postId = [r.post_id, r.platform_post_id].find(
      (v): v is string => typeof v === 'string' && v.length > 0,
    );
    out[platform] = {
      ...(typeof r.success === 'boolean' ? { success: r.success } : {}),
      ...(url ? { url } : {}),
      ...(error ? { error } : {}),
      ...(postId ? { post_id: postId } : {}),
    };
  }
  return out;
}

/** TikTok photo posts take a 90 character title; the rest goes to the description. */
export function tiktokPhotoTitle(caption: string): string {
  const flat = caption.replace(/\s+/g, ' ').trim();
  if (flat.length <= 90) return flat;
  const cut = flat.slice(0, 90);
  const space = cut.lastIndexOf(' ');
  return (space > 40 ? cut.slice(0, space) : cut).trim();
}

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
    const data = (await res.json()) as { status?: string; results?: unknown };
    const results = normalizeResults(data.results);
    if (Object.keys(results).length > 0 && (data.status === 'completed' || data.status === 'done')) {
      return results;
    }
    if (Object.keys(results).length > 0 && i > 5) {
      const pending = Object.values(results).some(
        (r) => r.success === undefined && !r.error && !r.url,
      );
      if (!pending) return results;
    }
  }
  throw new Error('Upload-Post status poll timed out');
}

async function callerManages(
  admin: AdminClient,
  caller: ManagerCaller,
  companyId: string,
): Promise<boolean> {
  if (caller === null) return true;
  return isManagerOf(admin, caller.userId, companyId, caller.platformAdmin);
}

const NO_DISTINCT_CAPTION = 'No distinct caption could be written for this creator';

/**
 * Asks vary-copy for this creator's own caption and reads back whatever it
 * wrote. Null means the brief still has no distinct wording for this creator.
 */
async function requestDistinctCaption(
  admin: AdminClient,
  assignmentId: string,
  briefId: string,
  companyId: string,
): Promise<string | null> {
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/vary-copy`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-cron-secret': Deno.env.get('CRON_SECRET') ?? '',
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({ brief_id: briefId, assignment_ids: [assignmentId] }),
  }).catch((e) => console.error('post-approved vary-copy error:', assignmentId, e));
  const { data } = await admin
    .from('assignments')
    .select('caption')
    .eq('id', assignmentId)
    .eq('company_id', companyId)
    .maybeSingle();
  const caption = (data?.caption ?? null) as string | null;
  return caption && caption.trim().length > 0 ? caption : null;
}

async function resolveTarget(
  admin: AdminClient,
  body: PostApprovedBody,
  caller: ManagerCaller,
): Promise<PostTarget | Response> {
  if (body.assignment_id) {
    const { data: assignment } = await admin
      .from('assignments')
      .select(
        'id, company_id, creator_id, brief_id, status, submission_id, task_id, caption, publish_at, publish_claimed_at',
      )
      .eq('id', body.assignment_id)
      .maybeSingle();
    if (
      !assignment ||
      !(await callerManages(admin, caller, assignment.company_id as string))
    ) {
      return jsonResponse({ error: 'assignment not found' }, 404);
    }
    const repostPlatforms =
      caller === null && body.repost_platforms
        ? body.repost_platforms.filter((p) => SUPPORTED_PLATFORMS.includes(p))
        : null;
    const allowedStatus = repostPlatforms ? 'posted' : 'approved';
    if (assignment.status !== allowedStatus) {
      return jsonResponse(
        { error: `assignment status is ${assignment.status}, need ${allowedStatus}` },
        409,
      );
    }
    // A manager cannot jump the schedule: the row must be due and already
    // claimed by publish-due (or left claimed after its retries ran out).
    if (caller !== null) {
      const publishAt = (assignment.publish_at ?? null) as string | null;
      const due =
        publishAt !== null &&
        new Date(publishAt).getTime() <= Date.now() &&
        assignment.publish_claimed_at !== null;
      if (!due) {
        return jsonResponse(
          { error: `This post is scheduled for ${publishAt ?? 'a later date'}` },
          409,
        );
      }
    }
    const companyId = assignment.company_id as string;
    let caption = (assignment.caption ?? null) as string | null;
    if (caption === null) {
      caption = await requestDistinctCaption(
        admin,
        assignment.id as string,
        assignment.brief_id as string,
        companyId,
      );
      if (caption === null) {
        await admin
          .from('assignments')
          .update({ publish_error: NO_DISTINCT_CAPTION, publish_claimed_at: null })
          .eq('id', assignment.id)
          .eq('company_id', companyId);
        return jsonResponse({ error: NO_DISTINCT_CAPTION }, 409);
      }
    }
    const { data: brief } = await admin
      .from('briefs')
      .select('format')
      .eq('id', assignment.brief_id)
      .eq('company_id', companyId)
      .maybeSingle();
    const isSlideshow = brief?.format === 'photo_carousel';
    // Slideshows never auto-post to TikTok: identical photo sets across
    // accounts got creators shadow banned. Creators save the slides from the
    // app and post them by hand. Videos still go out with per-creator copy.
    const platforms = (repostPlatforms ?? SUPPORTED_PLATFORMS).filter(
      (p) => !(isSlideshow && p === 'tiktok'),
    );
    if (platforms.length === 0) {
      return jsonResponse({ error: 'slideshows do not auto-post to TikTok' }, 409);
    }
    return {
      id: assignment.id as string,
      companyId,
      creatorId: assignment.creator_id as string,
      caption,
      platforms,
      assignmentId: assignment.id as string,
      taskId: (assignment.task_id ?? null) as string | null,
      briefId: assignment.brief_id as string,
      isSlideshow,
    };
  }

  const { data: task } = await admin
    .from('content_tasks')
    .select('id, title, caption, platforms, company_id, status, assigned_to')
    .eq('id', body.task_id)
    .maybeSingle();
  if (!task || !(await callerManages(admin, caller, task.company_id as string))) {
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
): Promise<{
  id: string;
  video_path: string | null;
  segment_paths: string[] | null;
  version: number | null;
  render_status: string | null;
  slide_aspect: string | null;
} | null> {
  type Row = {
    id: string;
    video_path: string | null;
    segment_paths: string[] | null;
    version: number | null;
    render_status: string | null;
    slide_aspect: string | null;
  };
  if (target.assignmentId) {
    const { data: assignment } = await admin
      .from('assignments')
      .select('submission_id')
      .eq('id', target.assignmentId)
      .eq('company_id', target.companyId)
      .maybeSingle();
    if (assignment?.submission_id) {
      const { data } = await admin
        .from('submissions')
        .select('id, video_path, segment_paths, version, render_status, slide_aspect')
        .eq('id', assignment.submission_id)
        .maybeSingle();
      if (data) return data as Row;
    }
    const { data } = await admin
      .from('submissions')
      .select(
        'id, video_path, segment_paths, version, render_status, slide_aspect, assignments!inner(company_id)',
      )
      .eq('assignment_id', target.assignmentId)
      .eq('assignments.company_id', target.companyId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) return data as Row;
  }
  if (target.taskId) {
    const { data } = await admin
      .from('submissions')
      .select('id, video_path, segment_paths, version, render_status, slide_aspect')
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

    const cronSecret = Deno.env.get('CRON_SECRET');
    const cronHeader = req.headers.get('x-cron-secret');
    const isCron = Boolean(cronSecret && cronHeader && cronHeader === cronSecret);

    let caller: ManagerCaller = null;
    if (!isCron) {
      const authHeader = req.headers.get('Authorization') ?? '';
      const { data: userData } = await admin.auth.getUser(
        authHeader.replace('Bearer ', ''),
      );
      if (!userData?.user) return jsonResponse({ error: 'unauthorized' }, 401);

      const { data: profile } = await admin
        .from('profiles')
        .select('role')
        .eq('id', userData.user.id)
        .maybeSingle();
      if (!profile) return jsonResponse({ error: 'forbidden' }, 403);
      caller = { userId: userData.user.id, platformAdmin: profile.role === 'admin' };
    }

    const resolved = await resolveTarget(admin, body, caller);
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

    // A platform that already carries a live or in-flight post for this
    // submission never gets the same content again: reposting identical
    // media stacks duplicate-content strikes on the creator's account.
    const { data: priorRows } = await admin
      .from('posts')
      .select('platform, status')
      .eq('submission_id', submission.id)
      .in('status', ['posted', 'pending']);
    const alreadyPosted = new Set((priorRows ?? []).map((r) => r.platform as string));
    const platforms = target.platforms.filter((p) => !alreadyPosted.has(p));
    if (platforms.length === 0) {
      return jsonResponse(
        {
          error: `already posted to ${target.platforms.join(', ')}; refusing to post the same content twice`,
        },
        409,
      );
    }

    // Common fields; platforms and media are appended per request below.
    const form = new FormData();
    form.append('user', creator.upload_post_profile);
    form.append('title', target.caption);
    form.append('async_upload', 'true');
    if (target.isSlideshow && platforms.includes('tiktok')) {
      // TikTok rejects photo posts whose title runs past 90 characters; the
      // full caption travels as the description instead.
      form.append('tiktok_title', tiktokPhotoTitle(target.caption));
      form.append('tiktok_description', target.caption.slice(0, 4000));
    }
    /** Instagram gets its own 4:5 slide set when the bake produced one. */
    let instagramPhotoUrls: string[] | null = null;

    let overlayWarning: string | null = null;
    let uploadUrl = 'https://api.upload-post.com/api/upload';

    // An edit still in flight must not be assembled a second time here: that
    // double bills every render step and races the running invocation.
    if (submission.render_status === 'rendering') {
      return jsonResponse({ error: 'edit still in progress, approve once it is ready' }, 409);
    }

    if (target.isSlideshow) {
      // Slideshow: the slides in segment_paths post as a photo carousel
      // (TikTok photo post + Instagram carousel). Trending music is layered
      // on afterwards through the existing music approval loop. The bake
      // (text boxes + inset pictures onto each slide) runs at submit time;
      // assemble here only as a fallback for submissions never rendered.
      uploadUrl = 'https://api.upload-post.com/api/upload_photos';
      let slidePaths = (submission.segment_paths ?? []) as string[];
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
          slidePaths = assembled.slidePaths ?? slidePaths;
          overlayWarning = assembled.overlayWarning;
        } catch (assembleError) {
          const detail =
            assembleError instanceof Error
              ? assembleError.message
              : String(assembleError);
          return jsonResponse({ error: 'slide bake failed', detail }, 502);
        }
      }
      if (slidePaths.length === 0) {
        return jsonResponse({ error: 'submission has no slides' }, 400);
      }
      const signSlide = async (path: string): Promise<string> => {
        const { data, error: slideError } = await admin.storage
          .from('videos')
          .createSignedUrl(path, 3600);
        if (slideError || !data?.signedUrl) {
          throw new Error(`could not sign slide url: ${slideError?.message ?? path}`);
        }
        return data.signedUrl;
      };
      try {
        for (const path of slidePaths) form.append('photos[]', await signSlide(path));
        if (platforms.includes('instagram')) {
          // Instagram feed carousels are 4:5: every 9:16 slide posts its
          // 1080x1350 copy, rendered now if the bake never made one. TikTok
          // keeps the 9:16.
          const igPaths = await ensureInstagramSlides(admin, slidePaths, submission.slide_aspect);
          if (igPaths.some((p, i) => p !== slidePaths[i])) {
            instagramPhotoUrls = [];
            for (const path of igPaths) instagramPhotoUrls.push(await signSlide(path));
          }
        }
      } catch (slideError) {
        const detail = slideError instanceof Error ? slideError.message : String(slideError);
        return jsonResponse({ error: 'could not prepare slides', detail }, 500);
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

    /** One Upload-Post request per media set: a platform with its own slide set posts alone. */
    const ownSet: Record<string, string[] | null> = {
      instagram: instagramPhotoUrls,
    };
    const groups: Array<{ platforms: string[]; photos: string[] | null }> = [
      { platforms: platforms.filter((p) => !ownSet[p]), photos: null },
      ...platforms
        .filter((p) => ownSet[p])
        .map((p) => ({ platforms: [p], photos: ownSet[p] })),
    ].filter((g) => g.platforms.length > 0);

    const postRows: Array<{
      task_id: string | null;
      assignment_id: string | null;
      submission_id: string;
      platform: string;
      provider_post_id: string | null;
      post_url: string | null;
      status: string;
    }> = [];
    let requestId: string | null = null;
    let results: Record<string, PlatformResult> = {};

    for (const group of groups) {
      const groupForm = new FormData();
      for (const [key, value] of form.entries()) {
        if (key === 'photos[]' && group.photos !== null) continue;
        groupForm.append(key, value);
      }
      for (const url of group.photos ?? []) groupForm.append('photos[]', url);
      for (const p of group.platforms) groupForm.append('platform[]', p);

      const uploadRes = await fetch(uploadUrl, {
        method: 'POST',
        headers: { Authorization: `Apikey ${apiKey}` },
        body: groupForm,
      });
      const uploadJson = (await uploadRes.json()) as {
        success?: boolean;
        request_id?: string;
        results?: unknown;
        message?: string;
        error?: string;
      };
      if (!uploadRes.ok || uploadJson.success === false) {
        const detail = uploadJson.message ?? uploadJson.error ?? JSON.stringify(uploadJson);
        // Rows already written for an earlier group stay; publish-due
        // reconciles them. The caller sees the failing platforms' error.
        if (postRows.length > 0) await admin.from('posts').insert(postRows);
        return jsonResponse(
          {
            error: `upload-post failed (${group.platforms.join(', ')}): ${String(detail).slice(0, 300)}`,
            detail,
          },
          uploadRes.status >= 500 ? 502 : 400,
        );
      }

      let groupResults = normalizeResults(uploadJson.results);
      const groupRequestId = uploadJson.request_id ?? null;
      if (groupRequestId && Object.keys(groupResults).length === 0) {
        // Upload-Post needs a minute or two; a poll that runs out leaves the
        // rows pending and publish-due reconciles them on its next tick.
        groupResults = await pollStatus(groupRequestId, apiKey).catch(() => ({}));
      }
      requestId = requestId ?? groupRequestId;
      results = { ...results, ...groupResults };
      for (const platform of group.platforms) {
        const r = groupResults[platform];
        postRows.push({
          task_id: target.taskId,
          assignment_id: target.assignmentId,
          submission_id: submission.id,
          platform,
          provider_post_id: groupRequestId ?? r?.post_id ?? null,
          post_url: r?.url ?? null,
          status: r?.success === false ? 'failed' : r?.url ? 'posted' : 'pending',
        });
      }
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
          .eq('company_id', target.companyId)
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
          .eq('company_id', target.companyId)
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
