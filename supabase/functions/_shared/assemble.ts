// Submission assembly: stitch the creator's clips into one video (Upload-Post
// FFmpeg) and burn brief overlays (Creatomate). Runs right after the creator
// submits (render-submission) so the admin reviews the finished file;
// post-approved keeps a fallback call for legacy submissions that were never
// assembled. submissions.render_status tracks the job:
// queued -> rendering -> ready | failed.

import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  buildRenderTimeline,
  DEFAULT_TEXT_OVERLAY,
  segmentBoxes,
  timelineHasOverlays,
  type BriefSegmentRow,
  type TimelineTextOverlay,
} from './renderTimeline.ts';
import {
  renderGreenScreenClip,
  renderOverlays,
  renderSlideImage,
} from './renderAdapter.ts';
import { removeBackground } from './backgroundRemoval.ts';

export type AdminClient = ReturnType<typeof createClient>;

export type SubmissionRow = {
  id: string;
  video_path: string | null;
  segment_paths: string[] | null;
  version: number | null;
};

export function uploadPostKey(): string {
  const key = Deno.env.get('UPLOAD_POST_API_KEY');
  if (!key) throw new Error('UPLOAD_POST_API_KEY missing');
  return key;
}

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

export async function signVideoUrls(
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

// Stitch and the WP9 basic pass merged into ONE job: one re-encode instead of
// two, one poll against the wall clock. Every input is normalized first
// (fps 30, 1080x1920, 48k stereo) so concat never sees mismatched clips —
// capture pins codec and resolution, but expo-camera cannot pin fps or audio
// sample rate, and front/back camera flips can change frame size.
// Head: -ss 0.15 on input 0 only (sync-safe). Tail: silenceremove + -shortest.
// Works for N=1 (replaces the old standalone edit pass).
async function stitchAndEditPass(params: {
  admin: AdminClient;
  apiKey: string;
  segmentPaths: string[];
  outputPath: string;
}): Promise<void> {
  const { admin, apiKey, segmentPaths, outputPath } = params;
  const files = await signVideoUrls(admin, segmentPaths);

  const n = segmentPaths.length;
  const inputs = segmentPaths.map((_p, i) => `-i {input${i}}`).join(' ');
  const normalize = segmentPaths
    .map(
      (_p, i) =>
        `[${i}:v]fps=30,scale=1080:1920:force_original_aspect_ratio=increase,` +
        `crop=1080:1920,setsar=1[v${i}];` +
        `[${i}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[a${i}]`,
    )
    .join(';');
  const streams = segmentPaths.map((_p, i) => `[v${i}][a${i}]`).join('');
  const fullCommand =
    `ffmpeg -y -hide_banner -ss 0.15 ${inputs} ` +
    `-filter_complex "${normalize};${streams}concat=n=${n}:v=1:a=1[cv][ca];` +
    `[ca]silenceremove=stop_periods=1:stop_duration=0.25:stop_threshold=-45dB:detection=peak,` +
    `loudnorm=I=-16:TP=-1.5:LRA=11[outa]" ` +
    `-map "[cv]" -map "[outa]" -c:v h264_nvenc -preset p5 -cq 23 ` +
    `-c:a aac -b:a 128k -shortest {output}`;

  await runFfmpegJob({
    admin,
    apiKey,
    files,
    fullCommand,
    outputPath,
    label: 'stitch-edit',
  });
}

// Chroma key the cutout (creator on solid green) over the screenshot, full
// frame. Audio maps from the raw clip: the matting output is video only.
async function greenScreenComposite(params: {
  admin: AdminClient;
  apiKey: string;
  backgroundUrl: string;
  greenUrl: string;
  clipUrl: string;
  outputPath: string;
}): Promise<void> {
  const { admin, apiKey, backgroundUrl, greenUrl, clipUrl, outputPath } =
    params;
  const fullCommand =
    `ffmpeg -y -hide_banner -loop 1 -i {input0} -i {input1} -i {input2} ` +
    `-filter_complex "[0:v]scale=1080:1920:force_original_aspect_ratio=increase,` +
    `crop=1080:1920,setsar=1[bg];` +
    `[1:v]scale=1080:1920:force_original_aspect_ratio=increase,` +
    `crop=1080:1920,setsar=1,chromakey=0x00FF00:0.28:0.06[fg];` +
    `[bg][fg]overlay=shortest=1[outv]" ` +
    `-map "[outv]" -map 2:a? -c:v h264_nvenc -preset p5 -cq 23 ` +
    `-c:a aac -b:a 128k -shortest {output}`;

  await runFfmpegJob({
    admin,
    apiKey,
    files: [backgroundUrl, greenUrl, clipUrl],
    fullCommand,
    outputPath,
    label: 'green-screen',
  });
}

type SegmentClips = { paths: string[]; durationsMs: number[] | null };

// Clips for a submission in slot order, latest attempt per slot, from
// submission_segments. Falls back to null so callers can use the legacy
// submissions.segment_paths array. Durations are null unless every clip has
// one (legacy backfilled rows have none) — overlay timing needs all of them.
async function resolveSegmentClips(
  admin: AdminClient,
  submissionId: string,
): Promise<SegmentClips | null> {
  const { data } = await admin
    .from('submission_segments')
    .select('slot_index, attempt, storage_path, duration_ms')
    .eq('submission_id', submissionId)
    .order('slot_index', { ascending: true })
    .order('attempt', { ascending: false });
  if (!data || data.length === 0) return null;

  const bySlot = new Map<
    number,
    { storage_path: string; duration_ms: number | null }
  >();
  for (const row of data) {
    const slot = row.slot_index as number;
    if (!bySlot.has(slot)) {
      bySlot.set(slot, {
        storage_path: row.storage_path as string,
        duration_ms: (row.duration_ms ?? null) as number | null,
      });
    }
  }
  const slots = [...bySlot.keys()].sort((a, b) => a - b);
  const paths = slots.map((s) => bySlot.get(s)!.storage_path);
  const durations = slots.map((s) => bySlot.get(s)!.duration_ms);
  const durationsMs = durations.every((d): d is number => d !== null)
    ? durations
    : null;
  return { paths, durationsMs };
}

export type AssembleResult = {
  videoPath: string;
  overlayWarning: string | null;
  /** Final slide image paths, photo submissions only. */
  slidePaths?: string[];
};

function isVideoFile(path: string): boolean {
  return /\.(mp4|mov|m4v|webm)$/i.test(path);
}

/**
 * Full edit pass for one submission. Videos: stitch clips, then burn overlays
 * when the brief has them. Photo carousels: bake the admin's text boxes and
 * inset picture onto each slide. Updates submissions as it goes and flips
 * render_status to ready (or failed + render_error on throw).
 */
export async function assembleSubmission(params: {
  admin: AdminClient;
  submission: SubmissionRow;
  /** assignment id or task id; keys the storage folder like every upload. */
  targetId: string;
  companyId: string;
  briefId: string | null;
}): Promise<AssembleResult> {
  const { admin, submission } = params;
  try {
    const isPhoto =
      submission.video_path !== null && !isVideoFile(submission.video_path);
    const result = isPhoto
      ? await runSlideshowAssembly(params)
      : await runAssembly(params);
    await admin
      .from('submissions')
      .update({ render_status: 'ready', render_error: null })
      .eq('id', submission.id);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await admin
      .from('submissions')
      .update({ render_status: 'failed', render_error: message })
      .eq('id', submission.id);
    throw error;
  }
}

/**
 * Photo carousel edit pass: for each submitted photo, bake the matching
 * slide's text boxes and inset picture into a final 1080x1920 JPEG. Slides
 * without any overlay pass through untouched. segment_paths ends up holding
 * the exact files post-approved sends to Upload-Post.
 */
async function runSlideshowAssembly(params: {
  admin: AdminClient;
  submission: SubmissionRow;
  targetId: string;
  companyId: string;
  briefId: string | null;
}): Promise<AssembleResult> {
  const { admin, submission, targetId, companyId, briefId } = params;
  const rawPaths =
    submission.segment_paths && submission.segment_paths.length > 0
      ? submission.segment_paths
      : submission.video_path
        ? [submission.video_path]
        : [];
  if (rawPaths.length === 0) throw new Error('submission has no slides');
  const version = submission.version ?? 1;

  let slideSegments: BriefSegmentRow[] = [];
  if (briefId) {
    const { data: segmentRows } = await admin
      .from('brief_segments')
      .select(
        'slot_index, kind, layout, overlay_text, show_on_screen, text_y, overlay_style, screenshot_url, screenshot_x, screenshot_y, screenshot_width',
      )
      .eq('brief_id', briefId)
      .eq('company_id', companyId)
      .eq('kind', 'slide')
      .order('slot_index', { ascending: true });
    slideSegments = (segmentRows ?? []) as BriefSegmentRow[];
  }

  let overlayWarning: string | null = null;
  const finalPaths = await Promise.all(
    rawPaths.map(async (rawPath, i) => {
      const segment = slideSegments[i];
      if (!segment) return rawPath;
      const boxes = segment.show_on_screen ? segmentBoxes(segment) : [];
      const insetPath =
        segment.screenshot_url && !isVideoFile(segment.screenshot_url)
          ? segment.screenshot_url
          : null;
      if (boxes.length === 0 && !insetPath) return rawPath;

      const renderKey = Deno.env.get('CREATOMATE_API_KEY');
      if (!renderKey) {
        throw new Error(
          'This slideshow has on-slide text or pictures but CREATOMATE_API_KEY is not set in the edge function env.',
        );
      }
      const [photoUrl] = await signVideoUrls(admin, [rawPath]);
      let inset: { url: string; x: number; y: number; width: number } | undefined;
      if (insetPath) {
        const { data: signedImg, error: imgError } = await admin.storage
          .from('brief-assets')
          .createSignedUrl(insetPath, 3600);
        if (imgError || !signedImg?.signedUrl) {
          throw new Error(
            `could not sign inset ${insetPath}: ${imgError?.message}`,
          );
        }
        inset = {
          url: signedImg.signedUrl,
          // Same defaults the app previews when no placement was saved.
          x: segment.screenshot_x ?? 0.5,
          y: segment.screenshot_y ?? 0.62,
          width: segment.screenshot_width ?? 0.85,
        };
      }
      const bytes = await renderSlideImage({
        apiKey: renderKey,
        photoUrl,
        boxes,
        inset,
      });
      const outPath = `${companyId}/${targetId}/${version}-slide-${i + 1}-final.jpg`;
      const { error: uploadError } = await admin.storage
        .from('videos')
        .upload(outPath, bytes, { contentType: 'image/jpeg', upsert: true });
      if (uploadError) {
        throw new Error(`could not store slide ${i + 1}: ${uploadError.message}`);
      }
      return outPath;
    }),
  );

  if (slideSegments.length === 0 && briefId) {
    overlayWarning = 'slides posted without text: this brief has no slide segments';
  }

  await admin
    .from('submissions')
    .update({ segment_paths: finalPaths, video_path: finalPaths[0] })
    .eq('id', submission.id);

  return { videoPath: finalPaths[0], overlayWarning, slidePaths: finalPaths };
}

async function runAssembly(params: {
  admin: AdminClient;
  submission: SubmissionRow;
  targetId: string;
  companyId: string;
  briefId: string | null;
}): Promise<AssembleResult> {
  const { admin, submission, targetId, companyId, briefId } = params;
  if (!submission.video_path) {
    throw new Error('submission has no video');
  }
  const apiKey = uploadPostKey();

  // Clips in slot order: submission_segments when present (new recordings),
  // legacy segment_paths otherwise, the single video_path as last resort.
  const clips = await resolveSegmentClips(admin, submission.id);
  const legacyPaths = submission.segment_paths ?? [];
  const segmentPaths =
    clips?.paths ??
    (legacyPaths.length > 0 ? legacyPaths : [submission.video_path]);
  const durationsMs = clips?.durationsMs ?? null;
  const version = submission.version ?? 1;

  let briefSegments: BriefSegmentRow[] = [];
  let textOverlay: TimelineTextOverlay = DEFAULT_TEXT_OVERLAY;
  if (briefId) {
    const { data: segmentRows } = await admin
      .from('brief_segments')
      .select(
        'slot_index, kind, layout, overlay_text, show_on_screen, text_y, overlay_style, screenshot_url, screenshot_x, screenshot_y, screenshot_width',
      )
      .eq('brief_id', briefId)
      .eq('company_id', companyId)
      .order('slot_index', { ascending: true });
    briefSegments = (segmentRows ?? []) as BriefSegmentRow[];

    const { data: briefRow } = await admin
      .from('briefs')
      .select('text_overlay')
      .eq('id', briefId)
      .maybeSingle();
    const raw = briefRow?.text_overlay as Partial<TimelineTextOverlay> | null;
    if (raw && typeof raw === 'object') {
      textOverlay = {
        enabled: raw.enabled !== false,
        mode: typeof raw.mode === 'string' ? raw.mode : DEFAULT_TEXT_OVERLAY.mode,
        text_color:
          typeof raw.text_color === 'string'
            ? raw.text_color
            : DEFAULT_TEXT_OVERLAY.text_color,
        accent_color:
          typeof raw.accent_color === 'string'
            ? raw.accent_color
            : DEFAULT_TEXT_OVERLAY.accent_color,
      };
    }
  }

  // Green screen pre-pass, TikTok style: the screenshot becomes the full
  // frame background and the creator is cut out over it (Robust Video
  // Matting, then chroma key). Composited into the clip BEFORE stitching so
  // downstream nothing knows the difference. Without a REPLICATE_API_TOKEN
  // the creator stays uncut in a circle bubble instead.
  let overlayWarning: string | null = null;
  const greenScreenSlots = briefSegments.filter(
    (s) => s.layout === 'green_screen' && s.screenshot_url,
  );
  if (greenScreenSlots.length > 0) {
    if (!durationsMs) {
      overlayWarning =
        'green screen skipped: this submission has no per-clip durations';
    } else {
      const replicateToken = Deno.env.get('REPLICATE_API_TOKEN') ?? null;
      for (const segment of greenScreenSlots) {
        const slot = briefSegments.indexOf(segment);
        if (slot < 0 || slot >= segmentPaths.length) continue;
        const [clipUrl] = await signVideoUrls(admin, [segmentPaths[slot]]);
        const { data: signedImg, error: imgError } = await admin.storage
          .from('brief-assets')
          .createSignedUrl(segment.screenshot_url!, 3600);
        if (imgError || !signedImg?.signedUrl) {
          throw new Error(
            `could not sign screenshot ${segment.screenshot_url}: ${imgError?.message}`,
          );
        }
        const compositePath = `${companyId}/${targetId}/${version}-gs-${slot}.mp4`;

        if (replicateToken) {
          const greenUrl = await removeBackground({
            apiToken: replicateToken,
            videoUrl: clipUrl,
          });
          await greenScreenComposite({
            admin,
            apiKey,
            backgroundUrl: signedImg.signedUrl,
            greenUrl,
            clipUrl,
            outputPath: compositePath,
          });
        } else {
          overlayWarning =
            'green screen cutout skipped: REPLICATE_API_TOKEN is not set, used the bubble layout instead';
          const renderKey = Deno.env.get('CREATOMATE_API_KEY');
          if (!renderKey) {
            throw new Error(
              'This brief has green screen segments but neither REPLICATE_API_TOKEN nor CREATOMATE_API_KEY is set in the edge function env.',
            );
          }
          const composite = await renderGreenScreenClip({
            apiKey: renderKey,
            clipUrl,
            imageUrl: signedImg.signedUrl,
            durationMs: durationsMs[slot],
          });
          const { error: gsUploadError } = await admin.storage
            .from('videos')
            .upload(compositePath, composite, {
              contentType: 'video/mp4',
              upsert: true,
            });
          if (gsUploadError) {
            throw new Error(
              `could not store green screen clip: ${gsUploadError.message}`,
            );
          }
        }
        segmentPaths[slot] = compositePath;
      }
    }
  }

  // One FFmpeg job on Upload-Post: normalize each clip, concat, trim,
  // loudnorm, conform 1080x1920. Single re-encode for any clip count.
  let videoPath = `${companyId}/${targetId}/${version}-edited.mp4`;
  await stitchAndEditPass({
    admin,
    apiKey,
    segmentPaths,
    outputPath: videoPath,
  });
  await admin
    .from('submissions')
    .update({ video_path: videoPath })
    .eq('id', submission.id);

  // On-screen text and screenshots from brief_segments, rendered through
  // the adapter. Overlay timing needs every clip's duration; legacy
  // submissions without them go through un-overlaid with a warning instead
  // of guessing.
  if (briefSegments.length > 0) {
    if (!durationsMs) {
      overlayWarning =
        'overlays skipped: this submission has no per-clip durations';
    } else {
      const timeline = buildRenderTimeline({ briefSegments, durationsMs, textOverlay });
      await admin
        .from('submissions')
        .update({ render_timeline: timeline })
        .eq('id', submission.id);

      if (timelineHasOverlays(timeline)) {
        const renderKey = Deno.env.get('CREATOMATE_API_KEY');
        if (!renderKey) {
          throw new Error(
            'This post has on-screen text or screenshots but CREATOMATE_API_KEY is not set in the edge function env.',
          );
        }
        const [videoUrl] = await signVideoUrls(admin, [videoPath]);
        const imageUrls: Record<string, string> = {};
        for (const img of timeline.images) {
          const { data: signedImg, error: imgError } = await admin.storage
            .from('brief-assets')
            .createSignedUrl(img.screenshot_path, 3600);
          if (imgError || !signedImg?.signedUrl) {
            throw new Error(
              `could not sign screenshot ${img.screenshot_path}: ${imgError?.message}`,
            );
          }
          imageUrls[img.screenshot_path] = signedImg.signedUrl;
        }
        const rendered = await renderOverlays({
          apiKey: renderKey,
          videoUrl,
          timeline,
          imageUrls,
        });
        const renderedPath = `${companyId}/${targetId}/${version}-rendered.mp4`;
        const { error: renderUploadError } = await admin.storage
          .from('videos')
          .upload(renderedPath, rendered, {
            contentType: 'video/mp4',
            upsert: true,
          });
        if (renderUploadError) {
          throw new Error(
            `could not store rendered video: ${renderUploadError.message}`,
          );
        }
        videoPath = renderedPath;
        await admin
          .from('submissions')
          .update({ video_path: renderedPath })
          .eq('id', submission.id);
      }
    }
  }

  return { videoPath, overlayWarning };
}
