// Render path for studio submissions: submissions.edit_document (see
// editDocument.ts) describes the post from source assets to final frame, so
// the stitch is one Upload-Post ffmpeg job built from its blocks instead of
// the brief_segments cut. Overlays, subtitles and slides then go through the
// same overlay stages and slide bake as the legacy path; the stitched cut
// lands at `{company}/{target}/{v}-edited.mp4` exactly where runAssembly
// writes it, so the resume, hand-off and manager re-render machinery in
// render-submission works unchanged.

import {
  AUDIO_CODEC,
  AUDIO_CONFORM,
  CONFORM_1080x1920,
  conformFilter,
  gainFilters,
  inputPlaceholder,
  instagramSlidePath,
  LOUDNORM,
  mapWithConcurrency,
  notifyReadyForReview,
  OVERLAY_WAIT_MS,
  parseStageJobId,
  parseStoredTimeline,
  parseWords,
  renderInstagramSlide,
  renderOverlaysWithFfmpeg,
  renderSlideWithFfmpeg,
  runFfmpegJob,
  signBriefAssets,
  signVideoUrls,
  slideFrame,
  stageJobId,
  uploadPostKey,
  VIDEO_CODEC,
  type AdminClient,
  type AssembleResult,
  type OverlayHandoff,
  type SlideTextBox,
  type SubmissionRow,
} from './assemble.ts';
import {
  assetById,
  DEFAULT_SUBTITLE_Y,
  blockDurationMs,
  documentDurationMs,
  MAX_CROP_SCALE,
  type BlockLayout,
  type Clip,
  type EditCrop,
  type EditDocument,
  type MediaAsset,
  type OverlayBox,
  type Slide,
  type SlideCrop,
  type SlideImage,
  type SlidePlacement,
  type SlideshowDocument,
  type VideoDocument,
} from './editDocument.ts';
import {
  DEFAULT_TEXT_OVERLAY,
  SUBTITLE_MAX_CHARS,
  timelineHasOverlays,
  type RenderTimeline,
  type SegmentBox,
  type TimelineImage,
  type TimelineText,
} from './renderTimeline.ts';
import { buildOverlayGraph, slideCommand } from './ffmpegOverlay.ts';
import { fontUrl } from './renderAdapter.ts';
import { subtitleLines, transcribeClip, type SubtitleLine, type TranscriptWord } from './cues.ts';

export type DocumentAssemblyContext = {
  admin: AdminClient;
  /** assignment id or task id; keys the storage folder like every upload. */
  targetId: string;
  companyId: string;
  handoff?: OverlayHandoff;
};

const FRAME_WIDTH = 1080;
const FRAME_HEIGHT = 1920;
const OUTPUT_FPS = 30;
const TRANSCRIBE_CONCURRENCY = 3;

type Rect = { width: number; height: number };

/** Pixel size of one cell of a block on the 1080x1920 frame. */
export function cellRect(layout: BlockLayout): Rect {
  if (layout === 'split_v') return { width: FRAME_WIDTH, height: FRAME_HEIGHT / 2 };
  if (layout === 'split_h') return { width: FRAME_WIDTH / 2, height: FRAME_HEIGHT };
  return { width: FRAME_WIDTH, height: FRAME_HEIGHT };
}

function sec(ms: number): string {
  return (ms / 1000).toFixed(3);
}

function even(n: number): number {
  const rounded = Math.round(n);
  return rounded % 2 === 0 ? rounded : rounded + 1;
}

/**
 * Aspect-fill a source into the cell, then the creator's crop: zoom about
 * the cell centre by `scale` and pan by (x, y) cell fractions, the same
 * transform CompositionBuilder.swift applies on the phone (content moves by
 * +x, so the visible window moves by -x).
 */
export function cellFitFilters(rect: Rect, crop: EditCrop | null): string {
  const { width, height } = rect;
  const scale = crop ? Math.min(MAX_CROP_SCALE, Math.max(1, crop.scale)) : 1;
  if (!crop || scale === 1) {
    return `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`;
  }
  const maxOffset = (scale - 1) / 2;
  const panX = Math.round(Math.min(maxOffset, Math.max(-maxOffset, crop.x)) * width);
  const panY = Math.round(Math.min(maxOffset, Math.max(-maxOffset, crop.y)) * height);
  const sign = (n: number): string => (n < 0 ? `+${-n}` : `-${n}`);
  return (
    `scale=${even(width * scale)}:${even(height * scale)}:force_original_aspect_ratio=increase,` +
    `crop=${width}:${height}:(iw-${width})/2${sign(panX)}:(ih-${height})/2${sign(panY)}`
  );
}

/** atempo only takes 0.5..2 per instance; 3x chains two. */
export function atempoChain(speed: number): string {
  if (speed === 1) return '';
  const steps: number[] = [];
  let remaining = speed;
  while (remaining > 2) {
    steps.push(2);
    remaining /= 2;
  }
  steps.push(remaining);
  return steps.map((s) => `,atempo=${s}`).join('');
}

export type GraphInput = {
  assetId: string;
  kind: MediaAsset['kind'];
  /** Longest a still is shown anywhere in the document, for its `-loop 1 -t`. */
  holdMs: number;
};

export type DocumentGraph = {
  /** One per distinct asset the blocks reference, in first-use order. */
  inputs: GraphInput[];
  /** filter_complex_script contents, chains joined with `;`. */
  filterGraph: string;
  /** `-i` flags for every input, placeholders indexed over inputs + the graph file. */
  inputFlags: string;
};

function cellSourceEndMs(cell: Clip, blockMs: number): number {
  return Math.min(cell.outMs, cell.inMs + Math.round(blockMs * cell.speed));
}

/**
 * The whole stitch as one filtergraph: every block's cells trimmed, sped up,
 * fitted and cropped to their rect, stacked for splits, audio mixed, blocks
 * concatenated, then the frame conform, loudnorm, gain and limiter.
 */
export function buildDocumentGraph(doc: VideoDocument): DocumentGraph {
  const inputs: GraphInput[] = [];
  const indexByAsset = new Map<string, number>();
  for (const block of doc.blocks) {
    const blockMs = blockDurationMs(block);
    for (const cell of block.cells) {
      const asset = assetById(doc, cell.assetId);
      if (!asset) throw new Error(`block ${block.id} references missing asset ${cell.assetId}`);
      const existing = indexByAsset.get(asset.id);
      if (existing === undefined) {
        indexByAsset.set(asset.id, inputs.length);
        inputs.push({ assetId: asset.id, kind: asset.kind, holdMs: blockMs });
      } else {
        inputs[existing].holdMs = Math.max(inputs[existing].holdMs, blockMs);
      }
    }
  }

  const chains: string[] = [];
  const pairs: string[] = [];
  doc.blocks.forEach((block, b) => {
    const blockMs = blockDurationMs(block);
    const rect = cellRect(block.layout);
    const videoLabels: string[] = [];
    const audioLabels: string[] = [];
    block.cells.forEach((cell, c) => {
      const asset = assetById(doc, cell.assetId)!;
      const index = indexByAsset.get(asset.id)!;
      const label = `${b}_${c}`;
      const fit = `${cellFitFilters(rect, cell.crop)},setsar=1,format=yuv420p`;
      if (asset.kind === 'image') {
        chains.push(
          `[${index}:v]fps=${OUTPUT_FPS},trim=duration=${sec(blockMs)},setpts=PTS-STARTPTS,${fit}[v${label}]`,
        );
      } else {
        const endMs = cellSourceEndMs(cell, blockMs);
        const setpts = cell.speed === 1 ? 'setpts=PTS-STARTPTS' : `setpts=(PTS-STARTPTS)/${cell.speed}`;
        chains.push(
          `[${index}:v]trim=start=${sec(cell.inMs)}:end=${sec(endMs)},${setpts},fps=${OUTPUT_FPS},${fit}[v${label}]`,
        );
        if (!cell.muted) {
          chains.push(
            `[${index}:a]atrim=start=${sec(cell.inMs)}:end=${sec(endMs)},asetpts=PTS-STARTPTS` +
              `${atempoChain(cell.speed)},${AUDIO_CONFORM}[a${label}]`,
          );
          audioLabels.push(`[a${label}]`);
        }
      }
      videoLabels.push(`[v${label}]`);
    });

    let videoOut = videoLabels[0];
    if (videoLabels.length === 2) {
      const stack = block.layout === 'split_h' ? 'hstack' : 'vstack';
      chains.push(`${videoLabels.join('')}${stack}=inputs=2:shortest=1[v${b}]`);
      videoOut = `[v${b}]`;
    }

    let audioOut: string;
    if (audioLabels.length === 0) {
      chains.push(
        `anullsrc=channel_layout=stereo:sample_rate=48000:duration=${sec(blockMs)},${AUDIO_CONFORM}[a${b}]`,
      );
      audioOut = `[a${b}]`;
    } else if (audioLabels.length === 1) {
      audioOut = audioLabels[0];
    } else {
      chains.push(`${audioLabels.join('')}amix=inputs=2:duration=shortest:normalize=0[a${b}]`);
      audioOut = `[a${b}]`;
    }
    pairs.push(`${videoOut}${audioOut}`);
  });

  chains.push(
    `${pairs.join('')}concat=n=${doc.blocks.length}:v=1:a=1[cv][ca]`,
    `[cv]fps=${OUTPUT_FPS},${CONFORM_1080x1920}[outv]`,
    `[ca]${LOUDNORM}${gainFilters(doc.gain)}[outa]`,
  );

  // Placeholders count the graph script appended by runFfmpegJob.
  const total = inputs.length + 1;
  const inputFlags = inputs
    .map((input, i) =>
      input.kind === 'image'
        ? `-loop 1 -t ${sec(input.holdMs)} -i ${inputPlaceholder(i, total)}`
        : `-i ${inputPlaceholder(i, total)}`,
    )
    .join(' ');

  return { inputs, filterGraph: chains.join(';'), inputFlags };
}

/** full_command for the document stitch; {graph} is filled by runFfmpegJob. */
export function documentStitchCommand(inputFlags: string): string {
  return (
    `ffmpeg -y -hide_banner ${inputFlags} -filter_complex_script {graph} ` +
    `-map "[outv]" -map "[outa]" ${VIDEO_CODEC} ${AUDIO_CODEC} -shortest {output}`
  );
}

function storagePathOf(doc: EditDocument, assetId: string): string {
  const asset = assetById(doc, assetId);
  if (!asset?.storagePath) throw new Error(`asset ${assetId} has not been uploaded`);
  return asset.storagePath;
}

// ---- Subtitles ----

/**
 * Words of every source clip moved onto the output clock: each unmuted video
 * cell contributes the words inside its trimmed range, shifted to its block
 * start and divided by its speed.
 */
export function outputWords(doc: VideoDocument, wordsByAsset: Map<string, TranscriptWord[]>): TranscriptWord[] {
  const out: TranscriptWord[] = [];
  let cursor = 0;
  for (const block of doc.blocks) {
    const blockMs = blockDurationMs(block);
    for (const cell of block.cells) {
      if (cell.muted) continue;
      const words = wordsByAsset.get(cell.assetId);
      if (!words) continue;
      const sourceEnd = cell.inMs + blockMs * cell.speed;
      for (const word of words) {
        if (word.e <= cell.inMs || word.s >= sourceEnd) continue;
        const s = cursor + Math.max(0, (word.s - cell.inMs) / cell.speed);
        const e = cursor + Math.min(blockMs, (word.e - cell.inMs) / cell.speed);
        out.push({ w: word.w, s: Math.round(s), e: Math.round(e) });
      }
    }
    cursor += blockMs;
  }
  return out.sort((a, b) => a.s - b.s);
}

export function documentSubtitleLines(
  doc: VideoDocument,
  wordsByAsset: Map<string, TranscriptWord[]>,
): SubtitleLine[] {
  const words = outputWords(doc, wordsByAsset);
  if (words.length === 0) return [];
  return subtitleLines(words, [[0, documentDurationMs(doc)]], 0, SUBTITLE_MAX_CHARS);
}

/** Video assets that play with sound somewhere in the document, in first-use order. */
function audibleAssetIds(doc: VideoDocument): string[] {
  const ids: string[] = [];
  for (const block of doc.blocks) {
    for (const cell of block.cells) {
      if (cell.muted || ids.includes(cell.assetId)) continue;
      if (assetById(doc, cell.assetId)?.kind === 'video') ids.push(cell.assetId);
    }
  }
  return ids;
}

/** `{ clips: [{ slot_index, asset_id, words }] }` from an earlier invocation; null unless every asset is covered. */
function storedAssetWords(raw: unknown, assetIds: string[]): Map<string, TranscriptWord[]> | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const clips: unknown = (raw as { clips?: unknown }).clips;
  if (!Array.isArray(clips)) return null;
  const byAsset = new Map<string, TranscriptWord[]>();
  for (const clip of clips as unknown[]) {
    if (typeof clip !== 'object' || clip === null) return null;
    const { asset_id, words } = clip as { asset_id?: unknown; words?: unknown };
    const parsed = parseWords(words);
    if (typeof asset_id !== 'string' || !parsed) return null;
    byAsset.set(asset_id, parsed);
  }
  for (const id of assetIds) if (!byAsset.has(id)) return null;
  return byAsset;
}

async function transcribeAssets(params: {
  admin: AdminClient;
  doc: VideoDocument;
  assetIds: string[];
  keyterms: string[];
}): Promise<Map<string, TranscriptWord[]>> {
  const { admin, doc, assetIds, keyterms } = params;
  const byAsset = new Map<string, TranscriptWord[]>();
  const apiKey = Deno.env.get('DEEPGRAM_API_KEY');
  if (!apiKey) {
    console.warn('transcription skipped: DEEPGRAM_API_KEY is not set');
    for (const id of assetIds) byAsset.set(id, []);
    return byAsset;
  }
  const paths = assetIds.map((id) => storagePathOf(doc, id));
  const urls = await signVideoUrls(admin, paths);
  const results = await mapWithConcurrency(urls, TRANSCRIBE_CONCURRENCY, async (url, i) => {
    try {
      return await transcribeClip({ url, apiKey, keyterms });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`transcription failed for ${paths[i]}: ${message}`);
      return [];
    }
  });
  assetIds.forEach((id, i) => byAsset.set(id, results[i]));
  return byAsset;
}

// ---- Timeline ----

function overlayBoxToSegmentBox(box: OverlayBox): SegmentBox {
  return {
    text: box.text,
    x: box.x,
    y: box.y,
    size: box.size,
    color: box.color,
    bg: box.bg,
    ...(box.width !== undefined ? { width: box.width } : {}),
  };
}

/** A slide's text box for the bake, keeping its per word colors. */
export function slideBoxToBakeBox(box: OverlayBox): SlideTextBox {
  const out: SlideTextBox = overlayBoxToSegmentBox(box);
  if (box.spans?.length) out.spans = box.spans.map((sp) => ({ ...sp }));
  return out;
}

/**
 * RenderTimeline for the overlay stages: one clip per block, every text and
 * picture overlay at the document's own absolute window (the drawtext chain
 * and the composite graph both gate on start_ms/duration_ms), subtitles from
 * the document's setting.
 */
export function buildDocumentTimeline(
  doc: VideoDocument,
  subtitles: SubtitleLine[] | null,
): RenderTimeline {
  const texts: TimelineText[] = [];
  const images: TimelineImage[] = [];
  for (const overlay of doc.overlays) {
    const window = { start_ms: overlay.startMs, duration_ms: Math.max(0, overlay.endMs - overlay.startMs) };
    const enter = overlay.enter ? { enter: overlay.enter } : {};
    if (overlay.kind === 'image') {
      images.push({
        screenshot_path: storagePathOf(doc, overlay.assetId),
        ...window,
        ...enter,
        x: overlay.x,
        y: overlay.y,
        width: overlay.width,
      });
      continue;
    }
    texts.push({
      text: overlay.text,
      ...window,
      ...enter,
      y: overlay.y,
      box: {
        x: overlay.x,
        size: overlay.size,
        color: overlay.color,
        bg: overlay.bg,
        ...(overlay.width !== undefined ? { width: overlay.width } : {}),
      },
    });
  }
  return {
    width: FRAME_WIDTH,
    height: FRAME_HEIGHT,
    text_overlay: DEFAULT_TEXT_OVERLAY,
    subtitles: doc.subtitles.enabled,
    subtitles_y: doc.subtitles.y,
    ...(subtitles && subtitles.length > 0 ? { subtitle_lines: subtitles } : {}),
    clips: doc.blocks.map((block, i) => ({ slot_index: i, duration_ms: blockDurationMs(block) })),
    texts,
    images,
  };
}

// ---- Video ----

async function companyName(admin: AdminClient, companyId: string): Promise<string | null> {
  const { data } = await admin.from('companies').select('name').eq('id', companyId).maybeSingle();
  const name: unknown = data?.name;
  return typeof name === 'string' ? name : null;
}

export async function assembleDocumentVideo(
  ctx: DocumentAssemblyContext,
  submission: SubmissionRow,
  doc: VideoDocument,
): Promise<AssembleResult> {
  const { admin, targetId, companyId, handoff } = ctx;
  if (doc.blocks.length === 0) throw new Error('edit document has no blocks');
  const apiKey = uploadPostKey();
  const version = submission.version ?? 1;
  const editedPath = `${companyId}/${targetId}/${version}-edited.mp4`;
  // A previous invocation already stitched this version; resume at overlays.
  const stitched = submission.video_path === editedPath;
  let videoPath = editedPath;
  let overlayWarning: string | null = null;

  if (!stitched) {
    const graph = buildDocumentGraph(doc);
    const files = await signVideoUrls(
      admin,
      graph.inputs.map((input) => storagePathOf(doc, input.assetId)),
    );
    await runFfmpegJob({
      admin,
      apiKey,
      files,
      fullCommand: documentStitchCommand(graph.inputFlags),
      outputPath: editedPath,
      label: 'stitch-document',
      filterGraph: graph.filterGraph,
    });
    await admin.from('submissions').update({ video_path: videoPath }).eq('id', submission.id);
  }

  // Subtitles come from the source clips: each audible asset is transcribed
  // once and its words are moved through the block trims and speeds onto the
  // output clock. The transcript is stored so a resumed or re-rendered pass
  // never asks Deepgram again.
  let subtitles: SubtitleLine[] | null = null;
  if (doc.subtitles.enabled) {
    const assetIds = audibleAssetIds(doc);
    const stored = storedAssetWords(submission.transcript, assetIds);
    const wordsByAsset =
      stored ??
      (await transcribeAssets({
        admin,
        doc,
        assetIds,
        keyterms: [await companyName(admin, companyId)].filter((n): n is string => n !== null),
      }));
    if (!stored) {
      await admin
        .from('submissions')
        .update({
          transcript: {
            clips: assetIds.map((id, i) => ({ slot_index: i, asset_id: id, words: wordsByAsset.get(id) ?? [] })),
          },
        })
        .eq('id', submission.id);
    }
    subtitles = documentSubtitleLines(doc, wordsByAsset);
  }

  const timeline = buildDocumentTimeline(doc, subtitles);
  await admin.from('submissions').update({ render_timeline: timeline }).eq('id', submission.id);
  if (!timelineHasOverlays(timeline)) return { videoPath, overlayWarning };

  if (!stitched && handoff && (await handoff())) {
    console.log(`overlays for ${submission.id} handed to a new invocation`);
    return { videoPath, overlayWarning, deferred: true };
  }
  console.log(`rendering overlays for ${submission.id}`);
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

// ---- Slideshow ----

/** ffmpeg crop of a source rectangle in source pixels; null when the crop is empty. */
export function slideCropFilter(crop: SlideCrop | null): string | null {
  if (!crop) return null;
  const width = Math.round(crop.width);
  const height = Math.round(crop.height);
  if (width <= 0 || height <= 0) return null;
  return `crop=${width}:${height}:${Math.max(0, Math.round(crop.x))}:${Math.max(0, Math.round(crop.y))}`;
}

/** Same anchor renderSlideWithFfmpeg puts first so a still bills one second. */
const QUOTA_ANCHOR_FILE = 'quota-anchor.mp4';

type PlacedImage = SlidePlacement & { path: string };

/** Clip files the slide bake cannot lay on a still (the legacy path skips them with isVideoFile). */
const VIDEO_PATH = /\.(mp4|mov|m4v|webm|m3u8)(\?|#|$)/i;

/**
 * Storage path the slide bake can sign. A storage path goes as it is (signed
 * from brief-assets, or from videos for an asset path); an https URL (a
 * library screenshot, a sticker) is copied once into the submission folder
 * under an asset path so overlayImageBucket reads it from videos.
 */
async function bakeablePath(
  admin: AdminClient,
  src: string,
  folder: string,
  key: string,
  cache: Map<string, Promise<string>>,
): Promise<string> {
  if (!/^https?:\/\//i.test(src)) return src;
  const hit = cache.get(src);
  if (hit) return hit;
  const job = (async () => {
    const res = await fetch(src);
    if (!res.ok) throw new Error(`could not fetch slide picture ${key}: ${res.status}`);
    const type = res.headers.get('content-type') ?? 'image/png';
    if (!/^image\//i.test(type)) throw new Error(`slide picture ${key} is ${type}, not a still image`);
    const ext = /jpe?g/i.test(type) ? 'jpg' : /webp/i.test(type) ? 'webp' : 'png';
    const path = `${folder}/asset-${key}.${ext}`;
    const { error } = await admin.storage
      .from('videos')
      .upload(path, new Uint8Array(await res.arrayBuffer()), { contentType: type, upsert: true });
    if (error) throw new Error(`could not store slide picture ${key}: ${error.message}`);
    return path;
  })();
  cache.set(src, job);
  return job;
}

/**
 * One composite job laying every picture (stickers first, the inset on top)
 * over the conformed photo, no text. renderSlideWithFfmpeg takes a single
 * inset, so a slide with more pictures, or pictures and no text, goes here.
 */
async function compositeSlideImages(params: {
  admin: AdminClient;
  photoPath: string;
  images: PlacedImage[];
  outputPath: string;
  label: string;
  frame: { width: number; height: number };
  preFilters?: string[];
}): Promise<void> {
  const { admin, photoPath, images, outputPath, label, frame } = params;
  const timeline: RenderTimeline = {
    width: frame.width,
    height: frame.height,
    text_overlay: DEFAULT_TEXT_OVERLAY,
    subtitles: false,
    subtitles_y: DEFAULT_SUBTITLE_Y,
    clips: [],
    texts: [],
    images: images.map((img) => ({
      screenshot_path: img.path,
      start_ms: 0,
      duration_ms: 1000,
      x: img.x,
      y: img.y,
      width: img.width,
    })),
  };
  const conform = [...(params.preFilters ?? []), conformFilter(frame.width, frame.height)].join(',');
  const imageUrls = await signBriefAssets(admin, images.map((img) => img.path));
  const [photoUrl] = await signVideoUrls(admin, [photoPath]);
  await runFfmpegJob({
    admin,
    apiKey: uploadPostKey(),
    files: [fontUrl(QUOTA_ANCHOR_FILE), photoUrl, ...imageUrls],
    filterGraph: buildOverlayGraph({
      timeline,
      images: images.map((_img, i) => ({ index: 2 + i, isVideo: false })),
      ass: '',
      baseFilters: conform,
      baseInput: 1,
    }),
    fullCommand: slideCommand({ inputCount: 2 + imageUrls.length }),
    outputPath,
    outputExtension: 'png',
    label: `${label} pictures`,
  });
}

/**
 * Bake one document slide: text boxes, the feature inset and the manager's
 * stickers. A lone inset with text goes through renderSlideWithFfmpeg the
 * way the legacy path bakes it; anything else composites the pictures first
 * and then burns the text onto that.
 */
async function bakeDocumentSlide(params: {
  admin: AdminClient;
  photoPath: string;
  boxes: SlideTextBox[];
  images: PlacedImage[];
  outputPath: string;
  label: string;
  frame: { width: number; height: number };
  preFilters?: string[];
}): Promise<void> {
  const { admin, photoPath, boxes, images, outputPath, label, frame } = params;
  const pre = params.preFilters?.length ? { preFilters: params.preFilters } : {};
  if (images.length === 0) {
    await renderSlideWithFfmpeg({ admin, photoPath, boxes, outputPath, label, frame, ...pre });
    return;
  }
  if (images.length === 1 && boxes.length > 0) {
    await renderSlideWithFfmpeg({ admin, photoPath, boxes, inset: images[0], outputPath, label, frame, ...pre });
    return;
  }
  if (boxes.length === 0) {
    await compositeSlideImages({ admin, photoPath, images, outputPath, label, frame, ...pre });
    return;
  }
  const composited = `${outputPath}.pictures.png`;
  try {
    await compositeSlideImages({ admin, photoPath, images, outputPath: composited, label, frame, ...pre });
    await renderSlideWithFfmpeg({ admin, photoPath: composited, boxes, outputPath, label, frame });
  } finally {
    await admin.storage.from('videos').remove([composited]);
  }
}

/** The slide's pictures for one copy, stickers under the inset, with bakeable paths. */
async function slidePictures(
  admin: AdminClient,
  slide: Slide,
  instagram: boolean,
  folder: string,
  cache: Map<string, Promise<string>>,
): Promise<PlacedImage[]> {
  const list: { img: SlideImage; key: string }[] = [
    ...(slide.pics ?? []).map((img, k) => ({ img, key: `${slide.id}-pic${k}` })),
    ...(slide.inset ? [{ img: slide.inset, key: `${slide.id}-inset` }] : []),
  ];
  const out: PlacedImage[] = [];
  for (const { img, key } of list) {
    const place = instagram && img.ig ? img.ig : { x: img.x, y: img.y, width: img.width };
    // One dead screenshot or sticker must not fail the whole post: the slide
    // bakes without that picture and the log says which one.
    try {
      if (VIDEO_PATH.test(img.path)) throw new Error('a video, not a still image');
      const path = await bakeablePath(admin, img.path, folder, key, cache);
      await signBriefAssets(admin, [path]);
      out.push({ path, ...place });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`slide ${slide.id}: skipping picture ${key} (${img.path}): ${message}`);
    }
  }
  return out;
}

export async function assembleDocumentSlideshow(
  ctx: DocumentAssemblyContext,
  submission: SubmissionRow,
  doc: SlideshowDocument,
): Promise<AssembleResult> {
  const { admin, targetId, companyId } = ctx;
  if (doc.slides.length === 0) throw new Error('edit document has no slides');
  const version = submission.version ?? 1;
  const frame = slideFrame(doc.aspect);
  const letterboxForInstagram = frame.height === 1920;
  const folder = `${companyId}/${targetId}`;
  const pictureCache = new Map<string, Promise<string>>();

  // Two at a time: each slide is up to two Upload-Post jobs plus its
  // Instagram copy, and the API rate limits creation, polling and downloads.
  const finalPaths = await mapWithConcurrency(doc.slides, 2, async (slide, i) => {
    const photoPath = storagePathOf(doc, slide.assetId);
    const boxes = slide.boxes.map(slideBoxToBakeBox);
    const outPath = `${folder}/${version}-slide-${i + 1}-final.png`;
    const crop = slideCropFilter(slide.crop);
    await bakeDocumentSlide({
      admin,
      photoPath,
      boxes,
      images: await slidePictures(admin, slide, false, folder, pictureCache),
      outputPath: outPath,
      label: `slide ${i + 1}`,
      frame,
      ...(crop ? { preFilters: [crop] } : {}),
    });
    if (letterboxForInstagram) {
      const igCrop = slideCropFilter(slide.instagramCrop);
      if (igCrop) {
        // The creator placed text for Instagram separately; the 9:16 spots
        // would land under the 4:5 feed chrome.
        const igBoxes = (slide.instagramBoxes ?? slide.boxes).map(slideBoxToBakeBox);
        await bakeDocumentSlide({
          admin,
          photoPath,
          boxes: igBoxes,
          images: await slidePictures(admin, slide, true, folder, pictureCache),
          outputPath: instagramSlidePath(outPath),
          label: `slide ${i + 1} instagram`,
          frame: slideFrame('4:5'),
          preFilters: [igCrop],
        });
      } else {
        await renderInstagramSlide(admin, outPath, `slide ${i + 1} instagram`);
      }
    }
    return outPath;
  });

  await admin
    .from('submissions')
    .update({ segment_paths: finalPaths, video_path: finalPaths[0] })
    .eq('id', submission.id);
  return { videoPath: finalPaths[0], overlayWarning: null, slidePaths: finalPaths };
}

// ---- Entry ----

/**
 * Document counterpart of assembleSubmission: routes on the document format,
 * flips render_status to ready (or failed + render_error) and notifies the
 * managers once the edit is watchable.
 */
export async function assembleDocumentSubmission(
  ctx: DocumentAssemblyContext,
  submission: SubmissionRow,
  doc: EditDocument,
): Promise<AssembleResult> {
  const { admin } = ctx;
  try {
    const result =
      doc.format === 'slideshow'
        ? await assembleDocumentSlideshow(ctx, submission, doc)
        : await assembleDocumentVideo(ctx, submission, doc);
    if (result.deferred) return result;
    await admin
      .from('submissions')
      .update({ render_status: 'ready', render_error: null })
      .eq('id', submission.id);
    await notifyReadyForReview(admin, submission.id);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`assemble document ${submission.id} failed: ${message}`);
    await admin
      .from('submissions')
      .update({ render_status: 'failed', render_error: message })
      .eq('id', submission.id);
    throw error;
  }
}
