import { createClient } from 'npm:@supabase/supabase-js@2';

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
};

type PlatformResult = {
  success?: boolean;
  url?: string;
  error?: string;
  post_id?: string;
};

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function uploadPostKey(): string {
  const key = Deno.env.get('UPLOAD_POST_API_KEY');
  if (!key) throw new Error('UPLOAD_POST_API_KEY missing');
  return key;
}

type AdminClient = ReturnType<typeof createClient>;

// Run an FFmpeg job on Upload-Post (docs.upload-post.com/api/ffmpeg-editor),
// download the result, and store it in the videos bucket.
async function runFfmpegJob(params: {
  admin: AdminClient;
  apiKey: string;
  files: string[];
  fullCommand: string;
  outputPath: string;
  label: string;
}): Promise<void> {
  const { admin, apiKey, files, fullCommand, outputPath, label } = params;

  const jobRes = await fetch(
    'https://api.upload-post.com/api/uploadposts/ffmpeg/jobs/upload',
    {
      method: 'POST',
      headers: {
        Authorization: `Apikey ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        files,
        full_command: fullCommand,
        output_extension: 'mp4',
      }),
    },
  );
  const jobJson = (await jobRes.json()) as {
    success?: boolean;
    job_id?: string;
    message?: string;
    error?: string;
  };
  if (!jobRes.ok || !jobJson.job_id) {
    throw new Error(
      `ffmpeg ${label} create failed: ${jobJson.message ?? jobJson.error ?? jobRes.status}`,
    );
  }

  let finished = false;
  for (let i = 0; i < 50; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const statusRes = await fetch(
      `https://api.upload-post.com/api/uploadposts/ffmpeg/jobs/${jobJson.job_id}`,
      { headers: { Authorization: `Apikey ${apiKey}` } },
    );
    const statusJson = (await statusRes.json()) as { status?: string };
    if (statusJson.status === 'FINISHED') {
      finished = true;
      break;
    }
    if (statusJson.status === 'ERROR') {
      throw new Error(`ffmpeg ${label} job errored`);
    }
  }
  if (!finished) throw new Error(`ffmpeg ${label} timed out`);

  const download = await fetch(
    `https://api.upload-post.com/api/uploadposts/ffmpeg/jobs/${jobJson.job_id}/download`,
    { headers: { Authorization: `Apikey ${apiKey}` } },
  );
  if (!download.ok) {
    throw new Error(`ffmpeg ${label} download failed: ${download.status}`);
  }
  const bytes = new Uint8Array(await download.arrayBuffer());

  const { error: uploadError } = await admin.storage
    .from('videos')
    .upload(outputPath, bytes, { contentType: 'video/mp4', upsert: true });
  if (uploadError) {
    throw new Error(`could not store ${label} video: ${uploadError.message}`);
  }
}

async function signVideoUrls(
  admin: AdminClient,
  paths: string[],
): Promise<string[]> {
  const urls: string[] = [];
  for (const path of paths) {
    const { data, error } = await admin.storage
      .from('videos')
      .createSignedUrl(path, 3600);
    if (error || !data?.signedUrl) {
      throw new Error(`could not sign ${path}: ${error?.message}`);
    }
    urls.push(data.signedUrl);
  }
  return urls;
}

// Concatenate segment clips into one video. Expo Go cannot run FFmpeg on device.
async function stitchSegments(params: {
  admin: AdminClient;
  apiKey: string;
  segmentPaths: string[];
  outputPath: string;
}): Promise<void> {
  const { admin, apiKey, segmentPaths, outputPath } = params;
  const files = await signVideoUrls(admin, segmentPaths);

  const n = segmentPaths.length;
  const inputs = segmentPaths.map((_p, i) => `-i {input${i}}`).join(' ');
  const streams = segmentPaths.map((_p, i) => `[${i}:v][${i}:a]`).join('');
  const fullCommand =
    `ffmpeg -y -hide_banner ${inputs} ` +
    `-filter_complex "${streams}concat=n=${n}:v=1:a=1[outv][outa]" ` +
    `-map "[outv]" -map "[outa]" -c:v h264_nvenc -preset p5 -cq 23 ` +
    `-c:a aac -b:a 128k {output}`;

  await runFfmpegJob({
    admin,
    apiKey,
    files,
    fullCommand,
    outputPath,
    label: 'stitch',
  });
}

// WP9 basic pass: trim head/tail dead air, loudnorm, conform 1080x1920.
// Head: -ss 0.15 (sync-safe). Tail: silenceremove stop_periods + -shortest.
async function basicEditPass(params: {
  admin: AdminClient;
  apiKey: string;
  inputPath: string;
  outputPath: string;
}): Promise<void> {
  const { admin, apiKey, inputPath, outputPath } = params;
  const files = await signVideoUrls(admin, [inputPath]);

  const fullCommand =
    'ffmpeg -y -hide_banner -ss 0.15 -i {input0} ' +
    '-vf "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1" ' +
    '-af "silenceremove=stop_periods=1:stop_duration=0.25:stop_threshold=-45dB:detection=peak,' +
    'loudnorm=I=-16:TP=-1.5:LRA=11" ' +
    '-c:v h264_nvenc -preset p5 -cq 23 -c:a aac -b:a 128k -shortest {output}';

  await runFfmpegJob({
    admin,
    apiKey,
    files,
    fullCommand,
    outputPath,
    label: 'edit',
  });
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
      .select('title, caption')
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
  };
}

// Latest submission for the target. Assignments prefer their pinned
// submission_id (backfilled rows point at task-keyed submissions).
async function resolveSubmission(
  admin: AdminClient,
  target: PostTarget,
): Promise<{ id: string; video_path: string | null; segment_paths: string[] | null; version: number | null } | null> {
  type Row = {
    id: string;
    video_path: string | null;
    segment_paths: string[] | null;
    version: number | null;
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
        .select('id, video_path, segment_paths, version')
        .eq('id', assignment.submission_id)
        .maybeSingle();
      if (data) return data as Row;
    }
    const { data } = await admin
      .from('submissions')
      .select('id, video_path, segment_paths, version')
      .eq('assignment_id', target.assignmentId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) return data as Row;
  }
  if (target.taskId) {
    const { data } = await admin
      .from('submissions')
      .select('id, video_path, segment_paths, version')
      .eq('task_id', target.taskId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) return data as Row;
  }
  return null;
}

Deno.serve(async (req) => {
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
    if (!caller || caller.role !== 'admin') {
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

    // Multi-segment takes are stitched into one video before posting.
    // Single segments skip stitching entirely.
    let videoPath = submission.video_path as string;
    const segmentPaths = (submission.segment_paths ?? []) as string[];
    const version = submission.version ?? 1;
    if (segmentPaths.length > 1) {
      const stitchedPath = `${target.companyId}/${target.id}/${version}-stitched.mp4`;
      try {
        await stitchSegments({
          admin,
          apiKey,
          segmentPaths,
          outputPath: stitchedPath,
        });
      } catch (stitchError) {
        const detail =
          stitchError instanceof Error
            ? stitchError.message
            : String(stitchError);
        return jsonResponse({ error: 'stitching failed', detail }, 502);
      }
      videoPath = stitchedPath;
      await admin
        .from('submissions')
        .update({ video_path: stitchedPath })
        .eq('id', submission.id);
    }

    // WP9: basic FFmpeg pass before Upload-Post (trim dead air, loudnorm, 1080x1920).
    const editedPath = `${target.companyId}/${target.id}/${version}-edited.mp4`;
    try {
      await basicEditPass({
        admin,
        apiKey,
        inputPath: videoPath,
        outputPath: editedPath,
      });
    } catch (editError) {
      const detail =
        editError instanceof Error ? editError.message : String(editError);
      return jsonResponse({ error: 'edit pass failed', detail }, 502);
    }
    videoPath = editedPath;
    await admin
      .from('submissions')
      .update({ video_path: editedPath })
      .eq('id', submission.id);

    const { data: signed, error: signError } = await admin.storage
      .from('videos')
      .createSignedUrl(videoPath, 3600);
    if (signError || !signed?.signedUrl) {
      return jsonResponse(
        { error: 'could not sign video url', detail: signError?.message },
        500,
      );
    }

    const platforms = target.platforms;
    if (platforms.length === 0) {
      return jsonResponse({ error: 'no platforms to post to' }, 400);
    }

    const form = new FormData();
    form.append('user', creator.upload_post_profile);
    form.append('title', target.caption);
    form.append('video', signed.signedUrl);
    form.append('async_upload', 'true');
    for (const p of platforms) form.append('platform[]', p);

    const uploadRes = await fetch('https://api.upload-post.com/api/upload', {
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
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({ error: message }, 500);
  }
});
