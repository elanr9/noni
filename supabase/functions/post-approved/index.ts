import { createClient } from 'npm:@supabase/supabase-js@2';

type PostApprovedBody = { task_id: string };

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

Deno.serve(async (req) => {
  try {
    const body = (await req.json().catch(() => null)) as PostApprovedBody | null;
    if (!body?.task_id) {
      return jsonResponse({ error: 'expected { task_id }' }, 400);
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

    const { data: task } = await admin
      .from('content_tasks')
      .select('id, title, caption, platforms, company_id, status, assigned_to')
      .eq('id', body.task_id)
      .maybeSingle();
    if (!task || task.company_id !== caller.company_id) {
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

    const { data: creator } = await admin
      .from('profiles')
      .select('id, full_name, upload_post_profile')
      .eq('id', task.assigned_to)
      .maybeSingle();
    if (!creator?.upload_post_profile) {
      return jsonResponse(
        {
          error:
            'Creator has not connected socials yet. They need to link TikTok/Instagram in Settings before you can post.',
          creator_id: task.assigned_to,
          creator_name: creator?.full_name ?? null,
        },
        400,
      );
    }

    const { data: submission } = await admin
      .from('submissions')
      .select('id, video_path, segment_paths, version')
      .eq('task_id', task.id)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();
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
      const stitchedPath = `${task.company_id}/${task.id}/${version}-stitched.mp4`;
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
    const editedPath = `${task.company_id}/${task.id}/${version}-edited.mp4`;
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

    const platforms = (task.platforms ?? ['tiktok', 'instagram']).filter(
      (p): p is string => typeof p === 'string' && p.length > 0,
    );
    if (platforms.length === 0) {
      return jsonResponse({ error: 'task has no platforms' }, 400);
    }

    const form = new FormData();
    form.append('user', creator.upload_post_profile);
    form.append('title', task.caption ?? task.title);
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
      task_id: string;
      submission_id: string;
      platform: string;
      provider_post_id: string | null;
      post_url: string | null;
      status: string;
    }> = [];

    for (const platform of platforms) {
      const r = results[platform];
      postRows.push({
        task_id: task.id,
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
      const { error: statusError } = await admin
        .from('content_tasks')
        .update({ status: 'posted' })
        .eq('id', task.id)
        .eq('status', 'approved');
      if (statusError) {
        return jsonResponse(
          {
            error: 'posts written but status flip failed',
            detail: statusError.message,
          },
          500,
        );
      }
    }

    return jsonResponse({
      request_id: requestId,
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
