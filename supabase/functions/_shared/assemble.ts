// Submission assembly: stitch the creator's clips into one video (Upload-Post
// FFmpeg) and burn brief overlays (Creatomate). Runs right after the creator
// submits (render-submission) so the admin reviews the finished file;
// post-approved keeps a fallback call for legacy submissions that were never
// assembled. submissions.render_status tracks the job:
// queued -> rendering -> ready | failed.

import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  buildRenderTimeline,
  DEFAULT_MEDIA_ASPECT,
  DEFAULT_TEXT_OVERLAY,
  fitInsetClearOfText,
  HEAD_TRIM_MS,
  segmentBoxes,
  textBand,
  timelineHasOverlays,
  type BriefSegmentRow,
  type ClipCut,
  type ClipWords,
  type MediaAspects,
  type TimelineTextOverlay,
} from './renderTimeline.ts';
import { renderGreenScreenClip, awaitRender, startOverlayRender } from './renderAdapter.ts';
import { removeBackground } from './backgroundRemoval.ts';
import { buildOverlayGraph, buildShapeAss, overlayCommand, slideCommand } from './ffmpegOverlay.ts';
import {
  buildDrawtextChain,
  needsCompositePass,
  textImageCommand,
  textVideoCommand,
} from './ffmpegText.ts';
import { fontUrl, isVideoSource, OVERLAY_TEXT_SPEC, SUBTITLE_Y } from './renderAdapter.ts';
import type { RenderTimeline, SegmentBox } from './renderTimeline.ts';
import {
  placeCue,
  speechRangesFromWords,
  transcribeClip,
  type CueContext,
  type SubmissionCue,
  type TranscriptWord,
} from './cues.ts';
import { askClaude } from './wp8.ts';

export type AdminClient = ReturnType<typeof createClient>;

export type SubmissionRow = {
  id: string;
  video_path: string | null;
  segment_paths: string[] | null;
  version: number | null;
  overlay_render_id?: string | null;
  audio_gain?: number | null;
  /** Photo posts: the crop aspect every slide was cut to in the app. */
  slide_aspect?: string | null;
  /** Manifest stored by the stitch invocation; reused when resuming at overlays. */
  render_timeline?: unknown;
  /** `{ clips: [{ slot_index, words }] }`, ms in each uploaded clip file. */
  transcript?: unknown | null;
  /** SubmissionCue[] for the slots the creator adjusted in the editor. */
  cues?: unknown | null;
};

export function uploadPostKey(): string {
  const key = Deno.env.get('UPLOAD_POST_API_KEY');
  if (!key) throw new Error('UPLOAD_POST_API_KEY missing');
  return key;
}

type FfmpegOutputExtension = 'mp4' | 'png' | 'jpg' | 'txt';

const IMAGE_CONTENT_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
};

const FFMPEG_JOBS_URL = 'https://api.upload-post.com/api/uploadposts/ffmpeg/jobs';
// Upload-Post workers may pick a job up hours after creation when their queue
// backs up; a 1h signed URL expired mid-queue and failed downloads with a 400.
const SIGNED_URL_TTL_SECONDS = 6 * 60 * 60;

// Create an FFmpeg job on Upload-Post (docs.upload-post.com/api/ffmpeg-editor),
// poll it to completion and return the result as a byte stream.
// Upload-Post rejects `;` `|` `&` `$` and backticks anywhere in the command,
// so no inline filtergraph may use `;` to separate chains.
const FFMPEG_POLL_MS = 270_000;
/** One second silent clip in the public render-fonts bucket; see renderSlideWithFfmpeg. */
const QUOTA_ANCHOR_FILE = 'quota-anchor.mp4';
/** overlay_render_id prefix marking an Upload-Post ffmpeg job rather than a Creatomate render. */
const FFMPEG_JOB_PREFIX = 'ffmpeg:';

async function createFfmpegJob(params: {
  apiKey: string;
  files: string[];
  fullCommand: string;
  outputExtension: FfmpegOutputExtension;
  label: string;
}): Promise<string> {
  const { apiKey, files, fullCommand, outputExtension, label } = params;
  if (/[;|&$`]/.test(fullCommand)) {
    throw new Error(`ffmpeg ${label} command contains a forbidden character`);
  }

  // Upload-Post rate limits job creation; back off and retry on 429.
  let jobJson: { success?: boolean; job_id?: string; message?: string; error?: string } = {};
  let jobStatus = 0;
  for (let attempt = 0; attempt < 6; attempt++) {
    const jobRes = await fetch(`${FFMPEG_JOBS_URL}/upload`, {
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
    });
    jobStatus = jobRes.status;
    jobJson = (await jobRes.json().catch(() => ({}))) as typeof jobJson;
    if (jobRes.ok && jobJson.job_id) break;
    const throttled = jobRes.status === 429 || /too many requests/i.test(jobJson.message ?? '');
    if (!throttled || attempt === 5) break;
    await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
  }
  if (!jobJson.job_id) {
    throw new Error(
      `ffmpeg ${label} create failed: ${jobJson.message ?? jobJson.error ?? jobStatus}`,
    );
  }
  console.log(`ffmpeg ${label} job created`);
  return jobJson.job_id;
}

/** Polls until finished (true), failed (throws) or the deadline passes (false). */
async function awaitFfmpegJob(params: {
  apiKey: string;
  jobId: string;
  label: string;
  deadline: number;
}): Promise<boolean> {
  const { apiKey, jobId, label } = params;
  while (Date.now() < params.deadline) {
    await new Promise((r) => setTimeout(r, 3000));
    const statusRes = await fetch(`${FFMPEG_JOBS_URL}/${jobId}`, {
      headers: { Authorization: `Apikey ${apiKey}` },
    });
    if (statusRes.status === 429) continue;
    const statusJson = (await statusRes.json().catch(() => ({}))) as {
      status?: string;
      exc_info?: string | null;
      result?: { stderr_tail?: string | null } | null;
    };
    const status = (statusJson.status ?? '').toLowerCase();
    if (status === 'finished' || status === 'done') return true;
    if (status === 'failed' || status === 'error') {
      const detail =
        statusJson.result?.stderr_tail?.trim().split('\n').slice(-3).join(' ') ??
        statusJson.exc_info?.trim().split('\n').pop() ??
        '';
      throw new Error(`ffmpeg ${label} job errored${detail ? `: ${detail}` : ''}`);
    }
  }
  return false;
}

async function downloadFfmpegJob(params: {
  apiKey: string;
  jobId: string;
  label: string;
}): Promise<ReadableStream<Uint8Array>> {
  const { apiKey, jobId, label } = params;
  // Upload-Post rate limits every endpoint; a slideshow downloads several
  // slides close together, so back off on 429 instead of failing the post.
  for (let attempt = 0; ; attempt++) {
    const download = await fetch(`${FFMPEG_JOBS_URL}/${jobId}/download`, {
      headers: { Authorization: `Apikey ${apiKey}` },
    });
    if (download.ok && download.body) return download.body;
    if (download.status === 429 && attempt < 6) {
      await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
      continue;
    }
    throw new Error(`ffmpeg ${label} download failed: ${download.status}`);
  }
}

async function executeFfmpegJob(params: {
  apiKey: string;
  files: string[];
  fullCommand: string;
  outputExtension: FfmpegOutputExtension;
  label: string;
}): Promise<ReadableStream<Uint8Array>> {
  const { apiKey, label } = params;
  const jobId = await createFfmpegJob(params);
  const done = await awaitFfmpegJob({ apiKey, jobId, label, deadline: Date.now() + FFMPEG_POLL_MS });
  if (!done) throw new Error(`ffmpeg ${label} timed out`);
  return downloadFfmpegJob({ apiKey, jobId, label });
}

// Run an FFmpeg job and store the media result in the videos bucket.
async function runFfmpegJob(params: {
  admin: AdminClient;
  apiKey: string;
  files: string[];
  fullCommand: string;
  outputPath: string;
  label: string;
  outputExtension?: 'mp4' | 'png' | 'jpg';
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

  try {
    const body = await executeFfmpegJob({ apiKey, files, fullCommand, outputExtension, label });
    console.log(`ffmpeg ${label} finished, storing ${outputPath}`);
    await streamToVideos({
      path: outputPath,
      contentType: IMAGE_CONTENT_TYPES[outputExtension] ?? 'video/mp4',
      body,
      label,
    });
    console.log(`ffmpeg ${label} stored ${outputPath}`);
  } finally {
    if (scriptPath) await admin.storage.from('videos').remove([scriptPath]);
  }
}

const fontCache = new Map<string, Uint8Array>();

async function fetchFont(file: string): Promise<Uint8Array> {
  const cached = fontCache.get(file);
  if (cached) return cached;
  const res = await fetch(fontUrl(file));
  if (!res.ok) throw new Error(`could not fetch overlay font ${file}: ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  fontCache.set(file, bytes);
  return bytes;
}

async function storageObjectExists(
  admin: AdminClient,
  bucket: string,
  path: string,
): Promise<boolean> {
  const slash = path.lastIndexOf('/');
  const folder = path.slice(0, slash);
  const name = path.slice(slash + 1);
  const { data } = await admin.storage.from(bucket).list(folder, { search: name });
  return (data ?? []).some((f) => f.name === name);
}

async function uploadTextToVideos(
  admin: AdminClient,
  path: string,
  text: string,
  label: string,
): Promise<void> {
  const { error } = await admin.storage
    .from('videos')
    .upload(path, new TextEncoder().encode(text), { contentType: 'video/mp4', upsert: true });
  if (error) throw new Error(`could not store ${label}: ${error.message}`);
}

/** The render_timeline stored by the previous render, if it parses. */
function parseStoredTimeline(raw: unknown): RenderTimeline | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const t = raw as Partial<RenderTimeline>;
  if (!Array.isArray(t.texts) || !Array.isArray(t.images) || typeof t.width !== 'number') {
    return null;
  }
  return t as RenderTimeline;
}

type OverlayStage = 'composite' | 'text';

/** overlay_render_id for an in-flight Upload-Post job of one overlay stage. */
function stageJobId(stage: OverlayStage, jobId: string): string {
  return `${FFMPEG_JOB_PREFIX}${stage}:${jobId}`;
}

function parseStageJobId(stored: string | null): { stage: OverlayStage; jobId: string } | null {
  if (!stored?.startsWith(FFMPEG_JOB_PREFIX)) return null;
  const rest = stored.slice(FFMPEG_JOB_PREFIX.length);
  const sep = rest.indexOf(':');
  if (sep < 0) return null;
  const stage = rest.slice(0, sep);
  if (stage !== 'composite' && stage !== 'text') return null;
  return { stage, jobId: rest.slice(sep + 1) };
}

/** Signs brief-assets paths in order. */
async function signBriefAssets(admin: AdminClient, paths: string[]): Promise<string[]> {
  const urls: string[] = [];
  for (const path of paths) {
    const { data, error } = await admin.storage
      .from('brief-assets')
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
    if (error || !data?.signedUrl) {
      throw new Error(`could not sign ${path}: ${error?.message}`);
    }
    urls.push(data.signedUrl);
  }
  return urls;
}

/**
 * Composite stage: pictures, recordings and bubble shapes onto the video
 * through a filter graph file. Returns the created job id.
 */
async function createCompositeJob(params: {
  admin: AdminClient;
  apiKey: string;
  timeline: RenderTimeline;
  videoPath: string;
  graphPath: string;
}): Promise<string> {
  const { admin, apiKey, timeline, videoPath, graphPath } = params;
  const imageUrls = await signBriefAssets(admin, timeline.images.map((img) => img.screenshot_path));
  const graph = buildOverlayGraph({
    timeline,
    images: timeline.images.map((img, i) => ({
      index: i + 1,
      isVideo: isVideoSource(img.screenshot_path),
    })),
    ass: buildShapeAss(timeline),
  });
  await uploadTextToVideos(admin, graphPath, graph, 'overlay graph');
  const [videoUrl, graphUrl] = await signVideoUrls(admin, [videoPath, graphPath]);
  const files = [videoUrl, ...imageUrls, graphUrl];
  const fullCommand = overlayCommand({
    inputCount: files.length - 1,
    hasImages: imageUrls.length > 0,
  }).replace('{graph}', inputPlaceholder(files.length - 1, files.length));
  return createFfmpegJob({ apiKey, files, fullCommand, outputExtension: 'mp4', label: 'composite' });
}

/**
 * Text stage: every title, bubble ink and subtitle line as drawtext with the
 * TikTok Sans TTF passed as a job file. Text files carry lines Upload-Post
 * would reject inline; they are stored under `${outputPath}.textN`.
 */
async function createTextJob(params: {
  admin: AdminClient;
  apiKey: string;
  timeline: RenderTimeline;
  videoPath: string;
  outputPath: string;
  textfilePaths: string[];
}): Promise<string> {
  const { admin, apiKey, timeline, videoPath, outputPath, textfilePaths } = params;
  const font = await fetchFont(OVERLAY_TEXT_SPEC.condensed.file);
  // Files: video, font, text files. Placeholders are indexed over that list.
  const plan = buildDrawtextChain({
    timeline,
    font,
    fontPlaceholder: '{input1}',
    textfilePlaceholder: (i) => `{input${2 + i}}`,
  });
  for (const [i, text] of plan.textfiles.entries()) {
    const path = `${outputPath}.text${i}`;
    await uploadTextToVideos(admin, path, text, `overlay text ${i}`);
    textfilePaths.push(path);
  }
  const [videoUrl, ...textUrls] = await signVideoUrls(admin, [videoPath, ...textfilePaths]);
  const files = [videoUrl, fontUrl(OVERLAY_TEXT_SPEC.condensed.file), ...textUrls];
  return createFfmpegJob({
    apiKey,
    files,
    fullCommand: textVideoCommand({ vf: plan.vf, fps: 30 }),
    outputExtension: 'mp4',
    label: 'text',
  });
}

/**
 * Everything the composite stage draws. Two timelines with the same
 * signature produce the same composited video, so a re-render that only
 * moved text or subtitles reuses the stored one.
 */
function compositeSignature(timeline: RenderTimeline): string {
  const overlay = timeline.text_overlay ?? DEFAULT_TEXT_OVERLAY;
  const bubbles = timeline.texts
    .filter((t) => (t.box ? t.box.bg : overlay.mode !== 'outline' && overlay.mode !== 'plain'))
    .map((t) => ({ text: t.text, s: t.start_ms, d: t.duration_ms, y: t.y, box: t.box ?? null }));
  return JSON.stringify({
    w: timeline.width,
    h: timeline.height,
    images: timeline.images,
    bubbles,
    accent: overlay.accent_color,
  });
}

// Overlay pass on Upload-Post ffmpeg in up to two jobs: a composite stage
// (pictures, recordings, bubble shapes) when the timeline has any, then the
// text stage. Resolves null when the current job is still running at the
// deadline; the caller hands the wait to a fresh invocation, which resumes on
// the stored stage and job id.
async function renderOverlaysWithFfmpeg(params: {
  admin: AdminClient;
  timeline: RenderTimeline;
  videoPath: string;
  outputPath: string;
  resume: { stage: OverlayStage; jobId: string } | null;
  deadline: number;
  onJobCreated: (stage: OverlayStage, jobId: string) => Promise<void>;
  /** Timeline of the previous render of this version, when one exists. */
  previousTimeline: RenderTimeline | null;
}): Promise<{ path: string; warning: string | null } | null> {
  const { admin, timeline, videoPath, outputPath } = params;
  const apiKey = uploadPostKey();
  const warning =
    timeline.subtitles && !timeline.subtitle_lines
      ? 'subtitles skipped: no transcript lines for this post'
      : null;
  const compositedPath = outputPath.replace(/-rendered\.mp4$/, '-composited.mp4');
  const graphPath = `${compositedPath}.graph`;
  const textfilePaths: string[] = [];
  const composite = needsCompositePass(timeline);
  // The composited cut is kept after a render; when pictures and bubbles are
  // unchanged since then, the text stage runs straight on it.
  const reuseComposite =
    composite &&
    params.resume === null &&
    params.previousTimeline !== null &&
    compositeSignature(params.previousTimeline) === compositeSignature(timeline) &&
    (await storageObjectExists(admin, 'videos', compositedPath));
  if (reuseComposite) console.log(`reusing composited cut ${compositedPath}`);

  let stage: OverlayStage =
    params.resume?.stage ?? (composite && !reuseComposite ? 'composite' : 'text');
  let jobId: string | null = params.resume?.jobId ?? null;

  if (stage === 'composite') {
    if (!jobId) {
      jobId = await createCompositeJob({ admin, apiKey, timeline, videoPath, graphPath });
      await params.onJobCreated('composite', jobId);
    }
    let settled = true;
    try {
      const done = await awaitFfmpegJob({ apiKey, jobId, label: 'composite', deadline: params.deadline });
      if (!done) {
        settled = false;
        return null;
      }
      const body = await downloadFfmpegJob({ apiKey, jobId, label: 'composite' });
      await streamToVideos({ path: compositedPath, contentType: 'video/mp4', body, label: 'composite' });
    } finally {
      if (settled) await admin.storage.from('videos').remove([graphPath]);
    }
    stage = 'text';
    jobId = null;
  }

  if (!jobId) {
    jobId = await createTextJob({
      admin,
      apiKey,
      timeline,
      videoPath: composite ? compositedPath : videoPath,
      outputPath,
      textfilePaths,
    });
    await params.onJobCreated('text', jobId);
  }
  let settled = true;
  try {
    const done = await awaitFfmpegJob({ apiKey, jobId, label: 'text', deadline: params.deadline });
    if (!done) {
      settled = false;
      return null;
    }
    const body = await downloadFfmpegJob({ apiKey, jobId, label: 'text' });
    await streamToVideos({ path: outputPath, contentType: 'video/mp4', body, label: 'text' });
  } finally {
    if (settled && textfilePaths.length > 0) {
      await admin.storage.from('videos').remove(textfilePaths);
    }
  }
  return { path: outputPath, warning };
}

// Bake one slideshow slide on Upload-Post ffmpeg: the photo conformed to the
// frame, the admin's inset picture and text boxes burnt in, stored as a PNG.
// A slide with an inset or a bubble runs the composite graph first (one job),
// then the drawtext pass (one job); bare text is a single job.
async function renderSlideWithFfmpeg(params: {
  admin: AdminClient;
  photoPath: string;
  boxes: SegmentBox[];
  inset?: { path: string; x: number; y: number; width: number };
  outputPath: string;
  label: string;
  frame: SlideFrame;
}): Promise<void> {
  const { admin, photoPath, boxes, inset, outputPath, label, frame } = params;
  const apiKey = uploadPostKey();
  const conform = conformFilter(frame.width, frame.height);
  const timeline: RenderTimeline = {
    width: frame.width,
    height: frame.height,
    text_overlay: DEFAULT_TEXT_OVERLAY,
    subtitles: false,
    subtitles_y: SUBTITLE_Y,
    clips: [],
    texts: boxes.map((box) => ({
      text: box.text,
      start_ms: 0,
      duration_ms: 1000,
      y: box.y,
      box: {
        x: box.x,
        size: box.size,
        color: box.color,
        bg: box.bg,
        ...(box.width !== undefined ? { width: box.width } : {}),
      },
    })),
    images: inset
      ? [
          {
            screenshot_path: inset.path,
            start_ms: 0,
            duration_ms: 1000,
            x: inset.x,
            y: inset.y,
            width: inset.width,
          },
        ]
      : [],
  };
  const font = await fetchFont(OVERLAY_TEXT_SPEC.condensed.file);
  const scratch: string[] = [];
  // Upload-Post bills a job by its first input's duration and assumes 60
  // seconds when a still has none; a one second anchor video first makes a
  // slide cost one second of quota instead of a minute.
  const anchorUrl = fontUrl(QUOTA_ANCHOR_FILE);
  try {
    let basePath = photoPath;
    let prefix = [conform];
    if (needsCompositePass(timeline)) {
      const compositedPath = `${outputPath}.composited.png`;
      const imageUrls = inset ? await signBriefAssets(admin, [inset.path]) : [];
      const [photoUrl] = await signVideoUrls(admin, [photoPath]);
      await runFfmpegJob({
        admin,
        apiKey,
        files: [anchorUrl, photoUrl, ...imageUrls],
        filterGraph: buildOverlayGraph({
          timeline,
          images: inset ? [{ index: 2, isVideo: false }] : [],
          ass: buildShapeAss(timeline),
          baseFilters: conform,
          baseInput: 1,
        }),
        fullCommand: slideCommand({ inputCount: 2 + imageUrls.length }),
        outputPath: compositedPath,
        outputExtension: 'png',
        label: `${label} composite`,
      });
      scratch.push(compositedPath);
      basePath = compositedPath;
      prefix = [];
    }
    const textfilePaths: string[] = [];
    const plan = buildDrawtextChain({
      timeline,
      font,
      fontPlaceholder: '{input2}',
      textfilePlaceholder: (i) => `{input${3 + i}}`,
      prefix,
    });
    for (const [i, text] of plan.textfiles.entries()) {
      const path = `${outputPath}.text${i}`;
      await uploadTextToVideos(admin, path, text, `${label} text ${i}`);
      textfilePaths.push(path);
      scratch.push(path);
    }
    const [baseUrl, ...textUrls] = await signVideoUrls(admin, [basePath, ...textfilePaths]);
    await runFfmpegJob({
      admin,
      apiKey,
      files: [anchorUrl, baseUrl, fontUrl(OVERLAY_TEXT_SPEC.condensed.file), ...textUrls],
      fullCommand: textImageCommand({ vf: plan.vf }),
      outputPath,
      outputExtension: 'png',
      label,
    });
  } finally {
    if (scratch.length > 0) await admin.storage.from('videos').remove(scratch);
  }
}

/** Instagram feed carousels are 4:5 at most; a 9:16 slide gets cropped. */
export const INSTAGRAM_SLIDE_SUFFIX = '-ig.png';

type SlideFrame = { width: number; height: number };

/**
 * Output size for a photo post. The app crops every slide to one of these
 * aspects (submissions.slide_aspect); 4:5 and 1:1 post as they are on both
 * platforms, 9:16 keeps the Instagram letterbox copy.
 */
export function slideFrame(aspect: string | null | undefined): SlideFrame {
  if (aspect === '4:5') return { width: 1080, height: 1350 };
  if (aspect === '1:1') return { width: 1080, height: 1080 };
  return { width: 1080, height: 1920 };
}

/**
 * Letterboxed copy of a finished 9:16 slide at another aspect: the slide
 * scaled to full height and centred over a blurred, darkened cover copy of
 * itself, so nothing is cropped away and the text stays where the creator
 * put it. Instagram gets 1080x1350. TikTok keeps the 9:16 slide: its photo
 * viewer shows that full width for viewers (the owner's view crops only
 * because of the promo banner TikTok adds under your own posts).
 */
async function renderLetterboxedSlide(params: {
  admin: AdminClient;
  slidePath: string;
  outputPath: string;
  width: number;
  height: number;
  outputExtension: 'png' | 'jpg';
  label: string;
}): Promise<void> {
  const { admin, slidePath, outputPath, width, height, outputExtension, label } = params;
  const [slideUrl] = await signVideoUrls(admin, [slidePath]);
  const graph = [
    '[1:v]split[a][b]',
    `[a]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},boxblur=40:8,eq=brightness=-0.15[bg]`,
    `[b]scale=-2:${height}[fg]`,
    '[bg][fg]overlay=(W-w)/2:0[outv]',
  ].join(';\n');
  await runFfmpegJob({
    admin,
    apiKey: uploadPostKey(),
    files: [fontUrl(QUOTA_ANCHOR_FILE), slideUrl],
    filterGraph: graph,
    fullCommand:
      'ffmpeg -y -hide_banner -i {input0} -i {input1} -filter_complex_script {graph} ' +
      '-map "[outv]" -frames:v 1 -update 1 -q:v 2 {output}',
    outputPath,
    outputExtension,
    label,
  });
}

// Run an FFmpeg job whose {output} is a text file and return its contents.
async function runFfmpegTextJob(params: {
  apiKey: string;
  files: string[];
  fullCommand: string;
  label: string;
}): Promise<string> {
  const body = await executeFfmpegJob({ ...params, outputExtension: 'txt' });
  return await new Response(body).text();
}

export type KeepRange = { startMs: number; endMs: number | null };
/** Speech bounds of one clip; endMs null means the clip end is unknown. */
export type SpeechRanges = { startMs: number; endMs: number | null; keep: KeepRange[] };

type Cut = { startMs: number; endMs: number };

const SILENCE_DETECT = 'silencedetect=n=-30dB:d=0.2';
const SILENCE_MERGE_MS = 150;
// A silence touching the first/last EDGE_WINDOW_MS of the clip is a lead/tail.
const EDGE_WINDOW_MS = 350;
const LEAD_PAD_MS = 120;
const TAIL_PAD_MS = 250;
// Interior silences longer than GAP_TIGHTEN_MS shrink to 2 * GAP_KEEP_MS.
const GAP_TIGHTEN_MS = 1000;
const GAP_KEEP_MS = 175;
const MIN_CLIP_MS = 400;

function parseSilences(text: string, durationMs: number): Cut[] {
  const silences: Cut[] = [];
  let pending: number | null = null;
  for (const line of text.split('\n')) {
    const start = /lavfi\.silence_start=(-?[\d.]+)/.exec(line);
    if (start) {
      pending = Math.max(0, Math.round(parseFloat(start[1]) * 1000));
      continue;
    }
    const end = /lavfi\.silence_end=(-?[\d.]+)/.exec(line);
    if (end && pending !== null) {
      silences.push({ startMs: pending, endMs: Math.round(parseFloat(end[1]) * 1000) });
      pending = null;
    }
  }
  if (pending !== null) silences.push({ startMs: pending, endMs: durationMs });
  return silences;
}

function wholeClip(durationMs: number): SpeechRanges {
  return { startMs: 0, endMs: durationMs, keep: [{ startMs: 0, endMs: durationMs }] };
}

function speechRangesFromSilences(silences: Cut[], durationMs: number): SpeechRanges {
  let startMs = 0;
  let endMs = durationMs;
  const gaps: Cut[] = [];
  // A click or breath splits one pause into two; treat them as one.
  const merged: Cut[] = [];
  for (const s of silences) {
    const last = merged[merged.length - 1];
    if (last && s.startMs - last.endMs < SILENCE_MERGE_MS) last.endMs = s.endMs;
    else merged.push({ ...s });
  }
  for (const s of merged) {
    if (s.startMs <= EDGE_WINDOW_MS) {
      startMs = Math.max(startMs, s.endMs - LEAD_PAD_MS);
    } else if (s.endMs >= durationMs - EDGE_WINDOW_MS) {
      endMs = Math.min(endMs, s.startMs + TAIL_PAD_MS);
    } else if (s.endMs - s.startMs > GAP_TIGHTEN_MS) {
      gaps.push(s);
    }
  }
  startMs = Math.max(0, startMs);
  endMs = Math.min(durationMs, endMs);

  const keep: Cut[] = [];
  let cursor = startMs;
  for (const gap of gaps) {
    const pieceEnd = gap.startMs + GAP_KEEP_MS;
    const nextStart = gap.endMs - GAP_KEEP_MS;
    if (pieceEnd <= cursor || nextStart >= endMs) continue;
    keep.push({ startMs: cursor, endMs: pieceEnd });
    cursor = nextStart;
  }
  keep.push({ startMs: cursor, endMs });

  const total = keep.reduce((sum, r) => sum + (r.endMs - r.startMs), 0);
  if (total < MIN_CLIP_MS) return wholeClip(durationMs);
  return { startMs, endMs, keep };
}

// Whole clip, with the legacy 150 ms head trim on clip 0 only.
function legacyRanges(durationMs: number | null, clipIndex: number): SpeechRanges {
  const canTrim = durationMs === null || durationMs > HEAD_TRIM_MS + MIN_CLIP_MS;
  const startMs = clipIndex === 0 && canTrim ? HEAD_TRIM_MS : 0;
  return { startMs, endMs: durationMs, keep: [{ startMs, endMs: durationMs }] };
}

// Find where speech starts and ends in a clip (and long interior pauses) by
// running silencedetect on Upload-Post and reading the metadata dump back.
export async function detectSpeechRanges(params: {
  admin: AdminClient;
  apiKey: string;
  clipPath: string;
  durationMs: number | null;
  clipIndex: number;
}): Promise<SpeechRanges> {
  const { admin, apiKey, clipPath, durationMs, clipIndex } = params;
  if (durationMs === null) {
    console.warn(`silence detect skipped for ${clipPath}: duration unknown`);
    return legacyRanges(null, clipIndex);
  }
  try {
    const [file] = await signVideoUrls(admin, [clipPath]);
    const text = await runFfmpegTextJob({
      apiKey,
      files: [file],
      fullCommand:
        `ffmpeg -y -hide_banner -nostats -i {input} ` +
        `-af ${SILENCE_DETECT},ametadata=mode=print:file={output} -f null -`,
      label: `silence-${clipIndex}`,
    });
    return speechRangesFromSilences(parseSilences(text, durationMs), durationMs);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`silence detect failed for ${clipPath}: ${message}`);
    return legacyRanges(durationMs, clipIndex);
  }
}

function sec(ms: number): string {
  return (ms / 1000).toFixed(3);
}

function trimFilter(name: 'trim' | 'atrim', range: KeepRange): string {
  const end = range.endMs === null ? '' : `:end=${sec(range.endMs)}`;
  return `${name}=start=${sec(range.startMs)}${end}`;
}

// submissions.audio_gain applied after loudnorm; the limiter catches peaks.
function gainFilters(gain: number): string {
  if (gain === 1) return '';
  return `,volume=${gain.toFixed(2)},alimiter=limit=0.95:attack=5:release=50:level=false`;
}

function resolveAudioGain(raw: number | null | undefined): number {
  return typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : 2;
}

function cutsFromRanges(ranges: SpeechRanges[], durationsMs: number[]): ClipCut[] {
  return ranges.map((r, i) => ({
    source_duration_ms: durationsMs[i],
    keep_ms: r.keep.map((k): [number, number] => [k.startMs, k.endMs ?? durationsMs[i]]),
  }));
}

// Cuts written to submissions.render_timeline by the invocation that
// stitched, so a resumed overlay pass times text on the same cut.
function storedClipCuts(raw: unknown, count: number): ClipCut[] | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const clips: unknown = (raw as { clips?: unknown }).clips;
  if (!Array.isArray(clips) || clips.length !== count) return null;
  const cuts: ClipCut[] = [];
  for (const clip of clips as unknown[]) {
    if (typeof clip !== 'object' || clip === null) return null;
    const { keep_ms, source_duration_ms } = clip as {
      keep_ms?: unknown;
      source_duration_ms?: unknown;
    };
    if (typeof source_duration_ms !== 'number' || !Array.isArray(keep_ms)) return null;
    const keep: Array<[number, number]> = [];
    for (const pair of keep_ms as unknown[]) {
      const cells: unknown[] = Array.isArray(pair) ? pair : [];
      const [start, end] = cells;
      if (cells.length !== 2 || typeof start !== 'number' || typeof end !== 'number') {
        return null;
      }
      keep.push([start, end]);
    }
    cuts.push({ source_duration_ms, keep_ms: keep });
  }
  return cuts;
}

// ---- Transcript and overlay cues ----

const TRANSCRIBE_CONCURRENCY = 3;
const CUE_CONCURRENCY = 3;

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function parseWords(raw: unknown): TranscriptWord[] | null {
  if (!Array.isArray(raw)) return null;
  const words: TranscriptWord[] = [];
  for (const item of raw as unknown[]) {
    if (typeof item !== 'object' || item === null) return null;
    const { w, s, e } = item as { w?: unknown; s?: unknown; e?: unknown };
    if (typeof w !== 'string' || typeof s !== 'number' || typeof e !== 'number') return null;
    words.push({ w, s, e });
  }
  return words;
}

// Transcript stored by an earlier invocation; null unless every clip has words.
function storedTranscript(raw: unknown, count: number): ClipWords[] | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const clips: unknown = (raw as { clips?: unknown }).clips;
  if (!Array.isArray(clips)) return null;
  const bySlot = new Map<number, TranscriptWord[]>();
  for (const clip of clips as unknown[]) {
    if (typeof clip !== 'object' || clip === null) return null;
    const { slot_index, words } = clip as { slot_index?: unknown; words?: unknown };
    const parsed = parseWords(words);
    if (typeof slot_index !== 'number' || !parsed) return null;
    bySlot.set(slot_index, parsed);
  }
  const result: ClipWords[] = [];
  for (let i = 0; i < count; i++) {
    const words = bySlot.get(i);
    if (!words || words.length === 0) return null;
    result.push({ slot_index: i, words });
  }
  return result;
}

function optionalMs(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function parseSubmissionCues(raw: unknown): SubmissionCue[] {
  if (!Array.isArray(raw)) return [];
  const cues: SubmissionCue[] = [];
  for (const item of raw as unknown[]) {
    if (typeof item !== 'object' || item === null) continue;
    const c = item as Record<string, unknown>;
    if (typeof c.slot_index !== 'number') continue;
    cues.push({
      slot_index: c.slot_index,
      text_start_ms: optionalMs(c.text_start_ms),
      text_hold_ms: optionalMs(c.text_hold_ms),
      media_start_ms: optionalMs(c.media_start_ms),
      media_end_ms: optionalMs(c.media_end_ms),
      source: c.source === 'ai' ? 'ai' : 'creator',
    });
  }
  return cues;
}

// Words of four letters or more: the ones Deepgram would otherwise misspell.
function contentWords(text: string | null): string[] {
  if (!text) return [];
  return text.split(/[^\p{L}\p{N}']+/u).filter((w) => w.length >= 4);
}

function transcriptKeyterms(
  productName: string | null,
  segments: BriefSegmentRow[],
): string[] {
  const terms = new Set<string>();
  if (productName) terms.add(productName);
  for (const segment of segments) {
    for (const word of contentWords(segment.overlay_text)) terms.add(word);
  }
  return [...terms];
}

async function transcribeClips(params: {
  admin: AdminClient;
  segmentPaths: string[];
  keyterms: string[];
}): Promise<ClipWords[]> {
  const { admin, segmentPaths, keyterms } = params;
  const apiKey = Deno.env.get('DEEPGRAM_API_KEY');
  if (!apiKey) {
    console.warn('transcription skipped: DEEPGRAM_API_KEY is not set');
    return segmentPaths.map((_p, i) => ({ slot_index: i, words: [] }));
  }
  const urls = await signVideoUrls(admin, segmentPaths);
  return mapWithConcurrency(urls, TRANSCRIBE_CONCURRENCY, async (url, i) => {
    try {
      const words = await transcribeClip({ url, apiKey, keyterms });
      return { slot_index: i, words };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`transcription failed for ${segmentPaths[i]}: ${message}`);
      return { slot_index: i, words: [] };
    }
  });
}

function pathStem(path: string): string {
  const base = path.split('/').pop() ?? path;
  return base.replace(/\.[^.]+$/, '');
}

/** Pixel size from a PNG or JPEG header; null for anything else. */
function imageDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50) {
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1];
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      return { height: view.getUint16(offset + 5), width: view.getUint16(offset + 7) };
    }
    offset += 2 + view.getUint16(offset + 2);
  }
  return null;
}

/**
 * Height over width of every still inset, read from its file header so the
 * overlay pass knows how tall it renders. Recordings stay unknown and fall
 * back to a portrait phone, the tallest shape they realistically have.
 */
async function insetAspects(admin: AdminClient, paths: string[]): Promise<MediaAspects> {
  const aspects: MediaAspects = {};
  for (const path of new Set(paths)) {
    if (isVideoFile(path)) continue;
    const { data } = await admin.storage.from('brief-assets').download(path);
    if (!data) continue;
    const dims = imageDimensions(new Uint8Array(await data.arrayBuffer()));
    if (dims && dims.width > 0 && dims.height > 0) aspects[path] = dims.height / dims.width;
  }
  return aspects;
}

function mediaKindFromPath(path: string | null): CueContext['media_kind'] {
  if (!path) return null;
  return isVideoFile(path) ? 'recording' : 'screenshot';
}

type MediaDetails = { title: string | null; description: string | null };

// Titles and explanations the admin gave library media, keyed by file stem
// so a path copied into a brief still matches.
async function loadMediaDetails(
  admin: AdminClient,
  companyId: string,
): Promise<Map<string, MediaDetails>> {
  const { data } = await admin
    .from('media_library')
    .select('path, title, description')
    .eq('company_id', companyId);
  const details = new Map<string, MediaDetails>();
  for (const row of data ?? []) {
    const title = typeof row.title === 'string' ? row.title.trim() : '';
    const description = typeof row.description === 'string' ? row.description.trim() : '';
    if (title.length === 0 && description.length === 0) continue;
    details.set(pathStem(row.path as string), {
      title: title || null,
      description: description || null,
    });
  }
  return details;
}

function talkingPointText(points: unknown, index: number | null | undefined): string | null {
  if (typeof index !== 'number' || !Array.isArray(points)) return null;
  const point: unknown = points[index];
  if (typeof point !== 'object' || point === null) return null;
  const text = (point as { text?: unknown }).text;
  return typeof text === 'string' ? text : null;
}

function segmentNeedsCue(segment: BriefSegmentRow): boolean {
  const hasText = segment.show_on_screen && segmentBoxes(segment).length > 0;
  const hasMedia = segment.screenshot_url !== null && segment.layout !== 'green_screen';
  return hasText || hasMedia;
}

// One cue per slot with an overlay: the creator's when the editor stored one,
// otherwise placed from the transcript.
async function resolveCues(params: {
  admin: AdminClient;
  companyId: string;
  submissionCues: SubmissionCue[];
  briefSegments: BriefSegmentRow[];
  transcripts: ClipWords[];
  durationsMs: number[];
  talkingPoints: unknown;
  productName: string | null;
}): Promise<SubmissionCue[]> {
  const { admin, companyId, submissionCues, briefSegments, transcripts, durationsMs } = params;
  const slots = briefSegments
    .map((segment, i) => ({ segment, i }))
    .filter(({ segment, i }) => i < durationsMs.length && segmentNeedsCue(segment));
  const mediaDetails = slots.some(({ segment }) => segment.screenshot_url)
    ? await loadMediaDetails(admin, companyId)
    : new Map<string, MediaDetails>();
  return mapWithConcurrency(slots, CUE_CONCURRENCY, async ({ segment, i }) => {
    const stored = submissionCues.find((c) => c.slot_index === i);
    if (stored) {
      console.log(`cue slot ${i}: submission (${stored.source})`);
      return stored;
    }
    const media = segment.screenshot_url
      ? mediaDetails.get(pathStem(segment.screenshot_url)) ?? null
      : null;
    const ctx: CueContext = {
      kind: segment.kind,
      label: segment.overlay_text,
      point_text: talkingPointText(params.talkingPoints, segment.talking_point_index),
      media_title: media?.title ?? null,
      media_description: media?.description ?? null,
      media_kind: mediaKindFromPath(segment.screenshot_url),
      product_name: params.productName,
      duration_ms: durationsMs[i],
    };
    const words = transcripts.find((t) => t.slot_index === i)?.words ?? [];
    const cue = await placeCue(words, ctx, askClaude);
    console.log(`cue slot ${i}: placed (${cue.source})`);
    return { ...cue, slot_index: i };
  });
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
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
    if (error || !data?.signedUrl) {
      throw new Error(`could not sign ${path}: ${error?.message}`);
    }
    urls.push(data.signedUrl);
  }
  return urls;
}

const VIDEO_CODEC =
  '-c:v h264_nvenc -preset p6 -rc vbr -cq 19 -b:v 0 -maxrate 16M -bufsize 32M -profile:v high -pix_fmt yuv420p -movflags +faststart';
const AUDIO_CODEC = '-c:a aac -b:a 128k';
function conformFilter(width: number, height: number): string {
  return `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1`;
}
const CONFORM_1080x1920 = conformFilter(1080, 1920);

// Upload-Post names a lone input {input}; several are {input0}, {input1}, ...
function inputPlaceholder(index: number, total: number): string {
  return total === 1 ? '{input}' : `{input${index}}`;
}

// Conform one clip to fps 30, 1080x1920, 48k stereo AAC. A clip with no
// audio track (muted in the editor) gets silence so the concat never sees a
// missing stream. -shortest ends the silence with the video. Only the
// outer speech bounds are cut here; interior pauses are left alone.
async function normalizeClipPass(params: {
  admin: AdminClient;
  apiKey: string;
  clipPath: string;
  outputPath: string;
  range: SpeechRanges;
  loudnorm: boolean;
  audioGain: number;
}): Promise<void> {
  const { admin, apiKey, clipPath, outputPath, range, loudnorm, audioGain } = params;
  const [file] = await signVideoUrls(admin, [clipPath]);
  const seek =
    `-ss ${sec(range.startMs)} ` +
    (range.endMs === null ? '' : `-t ${sec(range.endMs - range.startMs)} `);
  const fullCommand =
    `ffmpeg -y -hide_banner ${seek}-i {input} ` +
    `-f lavfi -i anullsrc=channel_layout=stereo:sample_rate=48000 ` +
    `-map 0:v -map 0:a? -map 1:a ` +
    `-vf fps=30,${CONFORM_1080x1920} ` +
    `-af ${AUDIO_CONFORM}` +
    `${loudnorm ? `,${LOUDNORM}${gainFilters(audioGain)}` : ''} ` +
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

// One job: every keep range of every clip is trimmed and conformed (fps 30,
// 1080x1920, 48k stereo) inside the graph, concat joins the pieces in order,
// loudnorm evens the audio and the gain lifts it. Works for N=1.
async function stitchGraphPass(params: {
  admin: AdminClient;
  apiKey: string;
  segmentPaths: string[];
  ranges: SpeechRanges[];
  audioGain: number;
  outputPath: string;
}): Promise<void> {
  const { admin, apiKey, segmentPaths, ranges, audioGain, outputPath } = params;
  const n = segmentPaths.length;
  const files = await signVideoUrls(admin, segmentPaths);
  const inputs = segmentPaths.map((_p, i) => `-i ${inputPlaceholder(i, n + 1)}`).join(' ');
  const pieces: string[] = [];
  const streams: string[] = [];
  ranges.forEach((range, i) => {
    range.keep.forEach((keep, k) => {
      pieces.push(
        `[${i}:v]${trimFilter('trim', keep)},setpts=PTS-STARTPTS,fps=30,${CONFORM_1080x1920}[v${i}_${k}]`,
        `[${i}:a]${trimFilter('atrim', keep)},asetpts=PTS-STARTPTS,${AUDIO_CONFORM}[a${i}_${k}]`,
      );
      streams.push(`[v${i}_${k}][a${i}_${k}]`);
    });
  });
  const filterGraph = [
    ...pieces,
    `${streams.join('')}concat=n=${streams.length}:v=1:a=1[cv][ca]`,
    `[ca]${LOUDNORM}${gainFilters(audioGain)}[outa]`,
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
  ranges: SpeechRanges[];
  audioGain: number;
  outputPath: string;
  scratchPrefix: string;
}): Promise<void> {
  const { admin, apiKey, segmentPaths, ranges, audioGain, outputPath, scratchPrefix } = params;
  const n = segmentPaths.length;

  if (n === 1) {
    await normalizeClipPass({
      admin,
      apiKey,
      clipPath: segmentPaths[0],
      outputPath,
      range: ranges[0],
      loudnorm: true,
      audioGain,
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
        range: ranges[i],
        loudnorm: false,
        audioGain,
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
    `-filter_complex "${audioStreams}concat=n=${n}:v=0:a=1,${LOUDNORM}${gainFilters(audioGain)}[outa]" ` +
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
  ranges: SpeechRanges[];
  audioGain: number;
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
/**
 * Managers hear about a post once the edit is watchable, not at submit: the
 * push deep links into review, and review shows the finished cut.
 */
async function notifyReadyForReview(admin: AdminClient, submissionId: string): Promise<void> {
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret) return;
  const { data } = await admin
    .from('submissions')
    .select('assignment_id, task_id')
    .eq('id', submissionId)
    .maybeSingle();
  const body = data?.assignment_id
    ? { assignment_id: data.assignment_id as string, event: 'submitted' }
    : data?.task_id
      ? { task_id: data.task_id as string, event: 'submitted' }
      : null;
  if (!body) return;
  await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/notify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-cron-secret': secret },
    body: JSON.stringify(body),
  }).catch((e) => console.warn(`notify submitted failed: ${e}`));
}

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
    await notifyReadyForReview(admin, submission.id);
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

/** `{v}-slide-{n}-final.{png,jpg}` back to the uploaded `{v}-slide-{n}.{ext}`. */
async function originalSlidePath(admin: AdminClient, path: string): Promise<string> {
  const match = /^(.*\/)(\d+-slide-\d+)-final\.(?:png|jpg)$/.exec(path);
  if (!match) return path;
  const [, folder, stem] = match;
  const { data } = await admin.storage
    .from('videos')
    .list(folder.replace(/\/$/, ''), { search: `${stem}.` });
  const original = data?.find((o: { name: string }) => o.name.startsWith(`${stem}.`));
  return original ? `${folder}${original.name}` : path;
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
  const storedPaths =
    submission.segment_paths && submission.segment_paths.length > 0
      ? submission.segment_paths
      : submission.video_path
        ? [submission.video_path]
        : [];
  if (storedPaths.length === 0) throw new Error('submission has no slides');
  const version = submission.version ?? 1;
  // A re-run after a finished bake sees the -final files; go back to the
  // creator's originals so text is never baked twice.
  const rawPaths = await Promise.all(
    storedPaths.map((p) => originalSlidePath(admin, p)),
  );

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
  const frame = slideFrame(submission.slide_aspect);
  const letterboxForInstagram = frame.height === 1920;
  // Slides bake two at a time: each is up to two Upload-Post jobs and the
  // API rate limits job creation, polling and downloads alike.
  const finalPaths = await mapWithConcurrency(rawPaths, 2, async (rawPath, i) => {
      const segment = slideSegments[i];
      if (!segment) return rawPath;
      const boxes = segment.show_on_screen ? segmentBoxes(segment) : [];
      const insetPath =
        segment.screenshot_url && !isVideoFile(segment.screenshot_url)
          ? segment.screenshot_url
          : null;
      // A 9:16 slide with nothing to burn in posts as the creator cut it; other
      // aspects still bake so the file is exactly frame sized for both feeds.
      if (boxes.length === 0 && !insetPath && letterboxForInstagram) return rawPath;

      let inset: { path: string; x: number; y: number; width: number } | undefined;
      if (insetPath) {
        // A saved placement is what the creator and manager saw on the stage;
        // it bakes exactly there. Only an unplaced inset gets moved clear of
        // the text, from the same defaults the app draws (SLIDE_INSET_DEFAULTS).
        const placedByHuman =
          segment.screenshot_x !== null &&
          segment.screenshot_y !== null &&
          segment.screenshot_width !== null;
        const stored = {
          x: segment.screenshot_x ?? 0.5,
          y: segment.screenshot_y ?? 0.62,
          width: segment.screenshot_width ?? 0.85,
        };
        if (placedByHuman) {
          inset = { path: insetPath, ...stored };
        } else {
          const aspects = await insetAspects(admin, [insetPath]);
          const placed = fitInsetClearOfText(
            stored,
            aspects[insetPath] ?? DEFAULT_MEDIA_ASPECT,
            boxes.map(textBand),
          );
          inset = { path: insetPath, ...placed };
        }
      }
      const outPath = `${companyId}/${targetId}/${version}-slide-${i + 1}-final.png`;
      await renderSlideWithFfmpeg({
        admin,
        photoPath: rawPath,
        boxes,
        inset,
        outputPath: outPath,
        label: `slide ${i + 1}`,
        frame,
      });
      if (letterboxForInstagram) {
        await renderLetterboxedSlide({
          admin,
          slidePath: outPath,
          outputPath: outPath.replace(/\.(?:png|jpg)$/, INSTAGRAM_SLIDE_SUFFIX),
          width: 1080,
          height: 1350,
          outputExtension: 'png',
          label: `slide ${i + 1} instagram`,
        });
      }
      return outPath;
  });

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
  let talkingPoints: unknown = null;
  if (briefId) {
    const { data: segmentRows } = await admin
      .from('brief_segments')
      .select(
        'slot_index, kind, talking_point_index, layout, overlay_text, show_on_screen, text_y, overlay_style, screenshot_url, screenshot_x, screenshot_y, screenshot_width',
      )
      .eq('brief_id', briefId)
      .eq('company_id', companyId)
      .order('slot_index', { ascending: true });
    briefSegments = (segmentRows ?? []) as BriefSegmentRow[];

    const { data: briefRow } = await admin
      .from('briefs')
      .select('text_overlay, subtitles, subtitles_y, talking_points')
      .eq('id', briefId)
      .maybeSingle();
    talkingPoints = briefRow?.talking_points ?? null;
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

  const { data: companyRow } = await admin
    .from('companies')
    .select('name')
    .eq('id', companyId)
    .maybeSingle();
  const productName = typeof companyRow?.name === 'string' ? companyRow.name : null;

  // Word timestamps per clip drive the silence cut, the overlay cues and our
  // own subtitle lines. Measured on the uploaded clips, before any green
  // screen composite replaces them; any retry reuses the stored transcript
  // when it covers every clip (a resubmission is a new row, so it is never
  // stale).
  const storedWords = storedTranscript(submission.transcript, segmentPaths.length);
  const transcripts =
    storedWords ??
    (await transcribeClips({
      admin,
      segmentPaths,
      keyterms: transcriptKeyterms(productName, briefSegments),
    }));
  if (!storedWords) {
    await admin
      .from('submissions')
      .update({ transcript: { clips: transcripts } })
      .eq('id', submission.id);
  }
  const wordsForClip = (i: number): TranscriptWord[] =>
    transcripts.find((t) => t.slot_index === i)?.words ?? [];

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
          .createSignedUrl(segment.screenshot_url!, SIGNED_URL_TTL_SECONDS);
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

  // Trim silence, conform every clip, concat, loudnorm, 1080x1920 (see
  // stitchAndEditPass). Detection runs on the paths that get stitched, so a
  // green screen composite is measured rather than its raw clip.
  const audioGain = resolveAudioGain(submission.audio_gain);
  let clipCuts: ClipCut[] | null = stitched
    ? storedClipCuts(submission.render_timeline, segmentPaths.length)
    : null;
  let videoPath = editedPath;
  if (!stitched) {
    // Word timestamps place the cut; silencedetect covers clips without
    // them, one detection job at a time since Upload-Post throttles bursts.
    const ranges: SpeechRanges[] = [];
    for (let i = 0; i < segmentPaths.length; i++) {
      const durationMs = durationsMs?.[i] ?? null;
      const words = wordsForClip(i);
      const fromWords =
        words.length > 0 && durationMs !== null
          ? speechRangesFromWords(words, durationMs)
          : null;
      ranges.push(
        fromWords ??
          (await detectSpeechRanges({
            admin,
            apiKey,
            clipPath: segmentPaths[i],
            durationMs,
            clipIndex: i,
          })),
      );
    }
    clipCuts = durationsMs ? cutsFromRanges(ranges, durationsMs) : null;
    await stitchAndEditPass({
      admin,
      apiKey,
      segmentPaths,
      ranges,
      audioGain,
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
      const storedCues = parseSubmissionCues(submission.cues);
      const cues =
        durationsMs && briefSegments.length > 0
          ? await resolveCues({
              admin,
              companyId,
              submissionCues: storedCues,
              briefSegments,
              transcripts,
              durationsMs,
              talkingPoints,
              productName,
            })
          : [];
      // Newly placed cues are stored so a re-render (manager nudging text or
      // subtitles) never asks Claude again.
      if (cues.some((c) => !storedCues.some((s) => s.slot_index === c.slot_index))) {
        await admin.from('submissions').update({ cues }).eq('id', submission.id);
      }
      const mediaAspects = durationsMs
        ? await insetAspects(
            admin,
            briefSegments.flatMap((s) =>
              s.screenshot_url && s.layout !== 'green_screen' ? [s.screenshot_url] : [],
            ),
          )
        : {};
      const timeline = buildRenderTimeline({
        briefSegments: durationsMs ? briefSegments : [],
        durationsMs: durationsMs ?? [],
        clipCuts: durationsMs && clipCuts ? clipCuts : undefined,
        textOverlay,
        subtitles,
        subtitlesY,
        cues,
        words: transcripts,
        mediaAspects,
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
        // ffmpeg is the renderer; OVERLAY_RENDERER=creatomate keeps the old path for a comparison run.
        if (Deno.env.get('OVERLAY_RENDERER') !== 'creatomate') {
          const resume = parseStageJobId(submission.overlay_render_id ?? null);
          const clearJobId = () =>
            admin.from('submissions').update({ overlay_render_id: null }).eq('id', submission.id);
          let result: Awaited<ReturnType<typeof renderOverlaysWithFfmpeg>>;
          try {
            result = await renderOverlaysWithFfmpeg({
              admin,
              timeline,
              videoPath,
              outputPath: `${companyId}/${targetId}/${version}-rendered.mp4`,
              resume,
              deadline: Date.now() + OVERLAY_WAIT_MS,
              previousTimeline: parseStoredTimeline(submission.render_timeline),
              onJobCreated: async (stage, jobId) => {
                await admin
                  .from('submissions')
                  .update({ overlay_render_id: stageJobId(stage, jobId) })
                  .eq('id', submission.id);
              },
            });
          } catch (error) {
            await clearJobId();
            throw error;
          }
          if (!result) {
            if (handoff && (await handoff())) {
              console.log(`overlay ffmpeg job still running for ${submission.id}, handed off`);
              return { videoPath, overlayWarning, deferred: true };
            }
            await clearJobId();
            throw new Error('overlay ffmpeg job timed out');
          }
          videoPath = result.path;
          overlayWarning = result.warning ?? overlayWarning;
          await admin
            .from('submissions')
            .update({ video_path: videoPath, overlay_render_id: null })
            .eq('id', submission.id);
          return { videoPath, overlayWarning };
        }
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
            .createSignedUrl(img.screenshot_path, SIGNED_URL_TTL_SECONDS);
          if (imgError || !signedImg?.signedUrl) {
            throw new Error(
              `could not sign screenshot ${img.screenshot_path}: ${imgError?.message}`,
            );
          }
          imageUrls[img.screenshot_path] = signedImg.signedUrl;
        }
        // An overlay render that fails fails the edit: a post must never go
        // to review as the plain cut with its text, subtitles and screenshots
        // silently missing. A render still running at the deadline is handed
        // to the next invocation, which resumes on the stored id.
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
          await admin
            .from('submissions')
            .update({ overlay_render_id: null })
            .eq('id', submission.id);
          throw error;
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
