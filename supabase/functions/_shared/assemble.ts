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
  awaitRender,
  startOverlayRender,
  renderSlideImage,
} from './renderAdapter.ts';
import { removeBackground } from './backgroundRemoval.ts';

export type AdminClient = ReturnType<typeof createClient>;

export type SubmissionRow = {
  id: string;
  video_path: string | null;
  segment_paths: string[] | null;
  version: number | null;
  overlay_render_id?: string | null;
};

export function uploadPostKey(): string {
  const key = Deno.env.get('UPLOAD_POST_API_KEY');
  if (!key) throw new Error('UPLOAD_POST_API_KEY missing');
  return key;
}

// Run an FFmpeg job on Upload-Post (docs.upload-post.com/api/ffmpeg-editor),
// download the result, and store it in the videos bucket.
// Upload-Post rejects `;` `|` `&` `$` and backticks anywhere in the command,
// so no filtergraph here may use `;` to separate chains. Each pass below is
// one linear chain per -filter_complex (repeatable) or plain -vf/-af.
async function runFfmpegJob(params: {
  admin: AdminClient;
  apiKey: string;
  files: string[];
  fullCommand: string;
  outputPath: string;
  label: string;
  outputExtension?: 'mp4' | 'png';
  // Upload-Post rejects ';' in full_command, so a multi chain graph travels
  // as a file and the command reads it with -filter_complex_script. The
  // script is appended as the last input file; {graph} marks its placeholder.
  filterGraph?: string;
}): Promise<void> {
  const { admin, apiKey, outputPath, label } = params;
  const outputExtension = params.outputExtension ?? 'mp4';
  let files = params.files;
  let fullCommand = params.fullCommand;
  let scriptPath: string | null = null;
  if (params.filterGraph) {
    scriptPath = `${outputPath}.graph`;
    const { error } = await admin.storage
      .from('videos')
      .upload(scriptPath, new TextEncoder().encode(params.filterGraph), {
        contentType: 'video/mp4',
        upsert: true,
      });
    if (error) throw new Error(`could not store ${label} graph: ${error.message}`);
    const [scriptUrl] = await signVideoUrls(admin, [scriptPath]);
    files = [...files, scriptUrl];
    fullCommand = fullCommand.replace('{graph}', inputPlaceholder(files.length - 1, files.length));
  }
  if (/[;|&$`]/.test(fullCommand)) {
    throw new Error(`ffmpeg ${label} command contains a forbidden character`);
  }

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
        output_extension: outputExtension,
      }),
    },
  );
  console.log(`ffmpeg ${label} job created`);
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
  for (let i = 0; i < 90; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const statusRes = await fetch(
      `https://api.upload-post.com/api/uploadposts/ffmpeg/jobs/${jobJson.job_id}`,
      { headers: { Authorization: `Apikey ${apiKey}` } },
    );
    const statusJson = (await statusRes.json()) as {
      status?: string;
      exc_info?: string | null;
      result?: { stderr_tail?: string | null } | null;
    };
    const status = (statusJson.status ?? '').toLowerCase();
    if (status === 'finished' || status === 'done') {
      finished = true;
      break;
    }
    if (status === 'failed' || status === 'error') {
      const detail =
        statusJson.result?.stderr_tail?.trim().split('\n').slice(-3).join(' ') ??
        statusJson.exc_info?.trim().split('\n').pop() ??
        '';
      throw new Error(`ffmpeg ${label} job errored${detail ? `: ${detail}` : ''}`);
    }
  }
  if (!finished) throw new Error(`ffmpeg ${label} timed out`);

  const download = await fetch(
    `https://api.upload-post.com/api/uploadposts/ffmpeg/jobs/${jobJson.job_id}/download`,
    { headers: { Authorization: `Apikey ${apiKey}` } },
  );
  if (!download.ok || !download.body) {
    throw new Error(`ffmpeg ${label} download failed: ${download.status}`);
  }
  console.log(`ffmpeg ${label} finished, storing ${outputPath}`);
  await streamToVideos({
    path: outputPath,
    contentType: outputExtension === 'png' ? 'image/png' : 'video/mp4',
    body: download.body,
    label,
  });
  console.log(`ffmpeg ${label} stored ${outputPath}`);
  if (scriptPath) await admin.storage.from('videos').remove([scriptPath]);
}

// Pipe a byte stream straight into the videos bucket. The body is handed to
// fetch untouched so the bytes never pass through JS; copying a long render
// chunk by chunk in the isolate exhausts the edge function CPU budget.
export async function streamToVideos(params: {
  path: string;
  contentType: string;
  body: ReadableStream<Uint8Array>;
  label: string;
}): Promise<void> {
  const { path, contentType, body, label } = params;
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/storage/v1/object/videos/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      apikey: key,
      'Content-Type': contentType,
      'x-upsert': 'true',
    },
    body,
  });
  if (!res.ok) throw new Error(`could not store ${label}: upload ${res.status}`);
  console.log(`${label}: stored ${path}`);
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

const VIDEO_CODEC = '-c:v h264_nvenc -preset p5 -cq 23';
const AUDIO_CODEC = '-c:a aac -b:a 128k';
const CONFORM_1080x1920 =
  'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1';

// Upload-Post names a lone input {input}; several are {input0}, {input1}, ...
function inputPlaceholder(index: number, total: number): string {
  return total === 1 ? '{input}' : `{input${index}}`;
}

// Conform one clip to fps 30, 1080x1920, 48k stereo AAC. A clip with no
// audio track (muted in the editor) gets silence so the concat never sees a
// missing stream. -shortest ends the silence with the video. Head trim
// (-ss 0.15) is applied by the caller on the first clip only.
async function normalizeClipPass(params: {
  admin: AdminClient;
  apiKey: string;
  clipPath: string;
  outputPath: string;
  headTrim: boolean;
  loudnorm: boolean;
}): Promise<void> {
  const { admin, apiKey, clipPath, outputPath, headTrim, loudnorm } = params;
  const [file] = await signVideoUrls(admin, [clipPath]);
  const fullCommand =
    `ffmpeg -y -hide_banner ${headTrim ? '-ss 0.15 ' : ''}-i {input} ` +
    `-f lavfi -i anullsrc=channel_layout=stereo:sample_rate=48000 ` +
    `-map 0:v -map 0:a? -map 1:a ` +
    `-vf fps=30,${CONFORM_1080x1920} ` +
    `-af aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo` +
    `${loudnorm ? ',loudnorm=I=-16:TP=-1.5:LRA=11' : ''} ` +
    `${VIDEO_CODEC} ${AUDIO_CODEC} -shortest {output}`;

  await runFfmpegJob({
    admin,
    apiKey,
    files: [file],
    fullCommand,
    outputPath,
    label: 'normalize',
  });
}

const AUDIO_CONFORM = 'aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo';
const LOUDNORM = 'loudnorm=I=-16:TP=-1.5:LRA=11';

// One job: every clip is conformed (fps 30, 1080x1920, 48k stereo) inside
// the graph, concat joins them, loudnorm evens the audio. Head: -ss 0.15 on
// input 0 only. Works for N=1.
async function stitchGraphPass(params: {
  admin: AdminClient;
  apiKey: string;
  segmentPaths: string[];
  outputPath: string;
}): Promise<void> {
  const { admin, apiKey, segmentPaths, outputPath } = params;
  const n = segmentPaths.length;
  const files = await signVideoUrls(admin, segmentPaths);
  const inputs = segmentPaths
    .map((_p, i) => `${i === 0 ? '-ss 0.15 ' : ''}-i ${inputPlaceholder(i, n + 1)}`)
    .join(' ');
  const conform = segmentPaths.flatMap((_p, i) => [
    `[${i}:v]fps=30,${CONFORM_1080x1920}[v${i}]`,
    `[${i}:a]${AUDIO_CONFORM}[a${i}]`,
  ]);
  const streams = segmentPaths.map((_p, i) => `[v${i}][a${i}]`).join('');
  const filterGraph = [
    ...conform,
    `${streams}concat=n=${n}:v=1:a=1[cv][ca]`,
    `[ca]${LOUDNORM}[outa]`,
  ].join(';');

  await runFfmpegJob({
    admin,
    apiKey,
    files,
    fullCommand:
      `ffmpeg -y -hide_banner ${inputs} -filter_complex_script {graph} ` +
      `-map "[cv]" -map "[outa]" ${VIDEO_CODEC} ${AUDIO_CODEC} -shortest {output}`,
    outputPath,
    label: 'stitch-edit',
    filterGraph,
  });
}

// Fallback for clips with no audio track (fully muted in the editor): each
// clip is conformed on its own with silence injected, then one concat job
// joins the conformed copies. Costs N+1 jobs, so it only runs when the
// single graph job rejects a missing audio stream.
async function stitchNormalizedPass(params: {
  admin: AdminClient;
  apiKey: string;
  segmentPaths: string[];
  outputPath: string;
  scratchPrefix: string;
}): Promise<void> {
  const { admin, apiKey, segmentPaths, outputPath, scratchPrefix } = params;
  const n = segmentPaths.length;

  if (n === 1) {
    await normalizeClipPass({
      admin,
      apiKey,
      clipPath: segmentPaths[0],
      outputPath,
      headTrim: true,
      loudnorm: true,
    });
    return;
  }

  const normalizedPaths = segmentPaths.map((_p, i) => `${scratchPrefix}-norm-${i}.mp4`);
  await Promise.all(
    segmentPaths.map((clipPath, i) =>
      normalizeClipPass({
        admin,
        apiKey,
        clipPath,
        outputPath: normalizedPaths[i],
        headTrim: i === 0,
        loudnorm: false,
      }),
    ),
  );

  const files = await signVideoUrls(admin, normalizedPaths);
  const inputs = normalizedPaths.map((_p, i) => `-i ${inputPlaceholder(i, n)}`).join(' ');
  const videoStreams = normalizedPaths.map((_p, i) => `[${i}:v]`).join('');
  const audioStreams = normalizedPaths.map((_p, i) => `[${i}:a]`).join('');
  const fullCommand =
    `ffmpeg -y -hide_banner ${inputs} ` +
    `-filter_complex "${videoStreams}concat=n=${n}:v=1:a=0[cv]" ` +
    `-filter_complex "${audioStreams}concat=n=${n}:v=0:a=1,${LOUDNORM}[outa]" ` +
    `-map "[cv]" -map "[outa]" ${VIDEO_CODEC} ${AUDIO_CODEC} -shortest {output}`;

  await runFfmpegJob({
    admin,
    apiKey,
    files,
    fullCommand,
    outputPath,
    label: 'stitch-edit',
  });

  await admin.storage.from('videos').remove(normalizedPaths);
}

async function stitchAndEditPass(params: {
  admin: AdminClient;
  apiKey: string;
  segmentPaths: string[];
  outputPath: string;
  scratchPrefix: string;
}): Promise<void> {
  try {
    await stitchGraphPass(params);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!/matches no streams/i.test(message)) throw err;
    await stitchNormalizedPass(params);
  }
}

// Chroma key the cutout (creator on solid green) over the screenshot or
// screen recording, full frame. A still loops as an image; a recording loops
// as a stream so a short capture covers the whole clip. Audio maps from the
// raw clip: the matting output is video only.
async function greenScreenComposite(params: {
  admin: AdminClient;
  apiKey: string;
  backgroundUrl: string;
  backgroundIsVideo: boolean;
  greenUrl: string;
  clipUrl: string;
  outputPath: string;
}): Promise<void> {
  const { admin, apiKey, backgroundUrl, backgroundIsVideo, greenUrl, clipUrl, outputPath } =
    params;
  const backgroundInput = backgroundIsVideo
    ? '-stream_loop -1 -i {input0}'
    : '-loop 1 -i {input0}';
  const filterGraph = [
    `[0:v]fps=30,${CONFORM_1080x1920}[bg]`,
    `[1:v]${CONFORM_1080x1920},chromakey=0x00FF00:0.28:0.06[fg]`,
    `[bg][fg]overlay=shortest=1[outv]`,
  ].join(';');

  await runFfmpegJob({
    admin,
    apiKey,
    files: [backgroundUrl, greenUrl, clipUrl],
    fullCommand:
      `ffmpeg -y -hide_banner ${backgroundInput} -i {input1} -i {input2} ` +
      `-filter_complex_script {graph} ` +
      `-map "[outv]" -map 2:a? ${VIDEO_CODEC} ${AUDIO_CODEC} -shortest {output}`,
    outputPath,
    label: 'green-screen',
    filterGraph,
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
  /** True when the overlay pass was handed to a fresh invocation. */
  deferred?: boolean;
};

/**
 * Kicks a fresh invocation to carry on the overlay pass: once after the cut
 * is stored, and again whenever the Creatomate render is still in progress
 * at the wait deadline. Keeps a long edit off a single edge function wall
 * clock. Resolves true when the hand-off was made.
 */
export type OverlayHandoff = () => Promise<boolean>;

// How long one invocation waits on the overlay render before handing the
// wait to the next one. Well inside the 400s edge function wall clock.
const OVERLAY_WAIT_MS = 240_000;

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
  handoff?: OverlayHandoff;
}): Promise<AssembleResult> {
  const { admin, submission } = params;
  try {
    const isPhoto =
      submission.video_path !== null && !isVideoFile(submission.video_path);
    const result = isPhoto
      ? await runSlideshowAssembly(params)
      : await runAssembly(params);
    if (result.deferred) return result;
    await admin
      .from('submissions')
      .update({ render_status: 'ready', render_error: null })
      .eq('id', submission.id);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`assemble ${submission.id} failed: ${message}`);
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
          x: segment.screenshot_x ?? 0.72,
          y: segment.screenshot_y ?? 0.56,
          width: segment.screenshot_width ?? 0.34,
        };
      }
      const image = await renderSlideImage({
        apiKey: renderKey,
        photoUrl,
        boxes,
        inset,
      });
      const outPath = `${companyId}/${targetId}/${version}-slide-${i + 1}-final.jpg`;
      await streamToVideos({
        path: outPath,
        contentType: 'image/jpeg',
        body: image,
        label: `slide ${i + 1}`,
      });
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
  handoff?: OverlayHandoff;
}): Promise<AssembleResult> {
  const { admin, submission, targetId, companyId, briefId, handoff } = params;
  if (!submission.video_path) {
    throw new Error('submission has no video');
  }
  const apiKey = uploadPostKey();
  const version = submission.version ?? 1;
  const editedPath = `${companyId}/${targetId}/${version}-edited.mp4`;
  // A previous invocation already stitched this version (video_path points
  // at the cut it stored), so resume at the overlay pass.
  const stitched = submission.video_path === editedPath;

  // Clips in slot order: submission_segments when present (new recordings),
  // legacy segment_paths otherwise, the single video_path as last resort.
  const clips = await resolveSegmentClips(admin, submission.id);
  const legacyPaths = submission.segment_paths ?? [];
  const segmentPaths =
    clips?.paths ??
    (legacyPaths.length > 0 ? legacyPaths : [submission.video_path]);
  const durationsMs = clips?.durationsMs ?? null;

  let briefSegments: BriefSegmentRow[] = [];
  let textOverlay: TimelineTextOverlay = DEFAULT_TEXT_OVERLAY;
  let subtitles = false;
  let subtitlesY: number | undefined;
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
      .select('text_overlay, subtitles, subtitles_y')
      .eq('id', briefId)
      .maybeSingle();
    subtitles = briefRow?.subtitles === true;
    if (typeof briefRow?.subtitles_y === 'number') {
      subtitlesY = briefRow.subtitles_y;
    }
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
  if (greenScreenSlots.length > 0 && !stitched) {
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
            backgroundIsVideo: isVideoFile(segment.screenshot_url!),
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
          await streamToVideos({
            path: compositePath,
            contentType: 'video/mp4',
            body: composite,
            label: 'green screen clip',
          });
        }
        segmentPaths[slot] = compositePath;
      }
    }
  }

  // Conform every clip, concat, loudnorm, 1080x1920 (see stitchAndEditPass).
  let videoPath = editedPath;
  if (!stitched) {
    await stitchAndEditPass({
      admin,
      apiKey,
      segmentPaths,
      outputPath: videoPath,
      scratchPrefix: `${companyId}/${targetId}/${version}`,
    });
    await admin
      .from('submissions')
      .update({ video_path: videoPath })
      .eq('id', submission.id);
  }

  // On-screen text and screenshots from brief_segments, plus subtitles when
  // the campaign manager turned them on, rendered through the adapter.
  // Overlay timing needs every clip's duration; legacy submissions without
  // them go through un-overlaid with a warning instead of guessing.
  // Subtitles are transcribed from the stitched audio so they never need
  // per-clip durations.
  if (briefSegments.length > 0 || subtitles) {
    if (!durationsMs && !subtitles) {
      overlayWarning =
        'overlays skipped: this submission has no per-clip durations';
    } else {
      if (!durationsMs && briefSegments.length > 0) {
        overlayWarning =
          'overlays skipped: this submission has no per-clip durations, subtitles still applied';
      }
      const timeline = buildRenderTimeline({
        briefSegments: durationsMs ? briefSegments : [],
        durationsMs: durationsMs ?? [],
        textOverlay,
        subtitles,
        subtitlesY,
      });
      await admin
        .from('submissions')
        .update({ render_timeline: timeline })
        .eq('id', submission.id);

      if (timelineHasOverlays(timeline)) {
        if (!stitched && handoff && (await handoff())) {
          console.log(`overlays for ${submission.id} handed to a new invocation`);
          return { videoPath, overlayWarning, deferred: true };
        }
        console.log(`rendering overlays for ${submission.id}`);
        const renderKey = Deno.env.get('CREATOMATE_API_KEY');
        if (!renderKey) {
          throw new Error(
            'This post has on-screen text, screenshots or subtitles but CREATOMATE_API_KEY is not set in the edge function env.',
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
        // The stitched cut is already stored and watchable, so an overlay
        // render that fails degrades to that cut with a warning instead of
        // failing the whole edit. A render still running at the deadline is
        // handed to the next invocation, which resumes on the stored id.
        let rendered: ReadableStream<Uint8Array> | null = null;
        let renderId = submission.overlay_render_id ?? null;
        try {
          if (!renderId) {
            renderId = await startOverlayRender({
              apiKey: renderKey,
              videoUrl,
              timeline,
              imageUrls,
            });
            await admin
              .from('submissions')
              .update({ overlay_render_id: renderId })
              .eq('id', submission.id);
            console.log(`overlay render ${renderId} started for ${submission.id}`);
          }
          rendered = await awaitRender(
            renderKey,
            renderId,
            { width: timeline.width, height: timeline.height },
            Date.now() + OVERLAY_WAIT_MS,
          );
          if (!rendered) {
            if (handoff && (await handoff())) {
              console.log(`overlay render ${renderId} still running, handed to a new invocation`);
              return { videoPath, overlayWarning, deferred: true };
            }
            throw new Error('render timed out');
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          overlayWarning = `overlays skipped: ${message}`;
        }
        if (rendered) {
          const renderedPath = `${companyId}/${targetId}/${version}-rendered.mp4`;
          await streamToVideos({
            path: renderedPath,
            contentType: 'video/mp4',
            body: rendered,
            label: 'rendered video',
          });
          videoPath = renderedPath;
        }
        await admin
          .from('submissions')
          .update({ video_path: videoPath, overlay_render_id: null })
          .eq('id', submission.id);
      }
    }
  }

  return { videoPath, overlayWarning };
}
