// Noni's own render timeline. This is the pipeline's canonical shape;
// whichever render service we use sits behind a thin adapter that consumes
// this object. Swap the adapter, never the pipeline.

import {
  DEFAULT_SCREENSHOT_HOLD_MS,
  DEFAULT_TEXT_HOLD_MS,
  sourceToOutputMs,
  subtitleLines,
  type KeepRange,
  type SubmissionCue,
  type SubtitleLine,
  type TranscriptWord,
} from './cues.ts';

export type TimelineClip = {
  slot_index: number;
  /** Effective duration on the stitched output, after trimming. */
  duration_ms: number;
  /** Source ranges [start, end] in ms that survived the silence trim. */
  keep_ms?: Array<[number, number]>;
  /** Untrimmed recording length in ms. */
  source_duration_ms?: number;
};

/** Per-clip cut applied at stitch time; duration_ms is the sum of keep_ms. */
export type ClipCut = {
  source_duration_ms: number;
  keep_ms: Array<[number, number]>;
};

/** Entrance the adapter animates; absent means a hard cut like before. */
export type TimelineEnter = 'pop' | 'slide';

export type TimelineText = {
  text: string;
  start_ms: number;
  duration_ms: number;
  enter?: TimelineEnter;
  /** Normalized 0-1 vertical center, admin-placed; defaults to TEXT_Y. */
  y: number;
  /** Per-box style from the admin composer; absent on legacy segments. */
  box?: {
    /** Normalized 0-1 horizontal center. */
    x: number;
    /** Font size as a fraction of the frame width. */
    size: number;
    /** Admin-picked color; pastel-washed into the box fill when bg is true. */
    color: string;
    bg: boolean;
  };
};

export type TimelineImage = {
  /** Storage path in the brief-assets bucket; signed by the caller. */
  screenshot_path: string;
  start_ms: number;
  duration_ms: number;
  enter?: TimelineEnter;
  /** Normalized 0-1 center position and width fraction of the frame. */
  x: number;
  y: number;
  width: number;
};

/** Mirror of the client TextOverlay config stored on briefs.text_overlay. */
export type TimelineTextOverlay = {
  enabled: boolean;
  mode: string;
  text_color: string;
  accent_color: string;
};

export const DEFAULT_TEXT_OVERLAY: TimelineTextOverlay = {
  enabled: true,
  mode: 'box',
  text_color: '#B73B6B',
  accent_color: '#F9C9DC',
};

export type RenderTimeline = {
  width: number;
  height: number;
  /** Admin-configured on-screen text look for the whole post. */
  text_overlay: TimelineTextOverlay;
  /** Burn auto-transcribed two-line captions at the bottom of the frame. */
  subtitles: boolean;
  /** Centre of the subtitle block as a fraction of frame height. */
  subtitles_y: number;
  /**
   * Our own subtitle lines from the clip transcripts, absolute on the output.
   * Absent when any clip lacks a transcript; the adapter then auto-transcribes.
   */
  subtitle_lines?: SubtitleLine[];
  clips: TimelineClip[];
  texts: TimelineText[];
  images: TimelineImage[];
};

export type BriefSegmentRow = {
  slot_index: number;
  kind: string;
  talking_point_index?: number | null;
  /** 'standard' or 'green_screen' (screenshot big, creator in a bubble). */
  layout: string;
  overlay_text: string | null;
  show_on_screen: boolean;
  /** Admin-placed text position; null falls back to TEXT_Y. */
  text_y: number | null;
  /** JSONB; may hold { boxes: [...] } for multiple admin-placed text boxes. */
  overlay_style?: unknown;
  screenshot_url: string | null;
  /** Admin-placed overlay position; null falls back to the defaults below. */
  screenshot_x: number | null;
  screenshot_y: number | null;
  screenshot_width: number | null;
};

/** Editor stage the legacy px sizes were designed on (see lib/overlay-boxes). */
const LEGACY_STAGE_WIDTH = 390;

/** TikTok classic caption: white letters, black outline (see lib/overlay-boxes). */
const CLASSIC_TEXT_COLOR = '#FFFFFF';

/** Auto placement, mirrored from lib/overlay-boxes.ts autoLayoutBox. */
const AUTO_MIN_SIZE = 20 / LEGACY_STAGE_WIDTH;
const AUTO_MAX_SIZE = 40 / LEGACY_STAGE_WIDTH;
const AUTO_MAX_LINES = 4;
const AUTO_GLYPH_WIDTH = 0.55;
const BOX_MAX_WIDTH = 0.9;
const AUTO_Y_BY_INDEX = [0.22, 0.68, 0.45];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** Size and position for text nobody placed by hand. */
export function autoLayoutBox(
  text: string,
  index = 0,
): { size: number; x: number; y: number } {
  const chars = Math.max(1, text.trim().length);
  const fit = (BOX_MAX_WIDTH * AUTO_MAX_LINES) / (AUTO_GLYPH_WIDTH * chars);
  return {
    size: clamp(fit, AUTO_MIN_SIZE, AUTO_MAX_SIZE),
    x: 0.5,
    y: AUTO_Y_BY_INDEX[Math.min(index, AUTO_Y_BY_INDEX.length - 1)] ?? TEXT_Y,
  };
}

export type SegmentBox = {
  text: string;
  x: number;
  y: number;
  size: number;
  color: string;
  bg: boolean;
};

/** Text boxes for one segment: overlay_style.boxes, else the legacy columns. */
export function segmentBoxes(segment: BriefSegmentRow): SegmentBox[] {
  const style = segment.overlay_style;
  if (isRecord(style) && Array.isArray(style.boxes)) {
    return style.boxes.flatMap((raw, index) => {
      if (!isRecord(raw)) return [];
      const text = typeof raw.text === 'string' ? raw.text.trim() : '';
      if (text.length === 0) return [];
      const auto = autoLayoutBox(text, index);
      return [
        {
          text,
          x: num(raw.x, auto.x),
          y: num(raw.y, auto.y),
          size: num(raw.size, auto.size),
          color: typeof raw.color === 'string' ? raw.color : CLASSIC_TEXT_COLOR,
          bg: typeof raw.bg === 'boolean' ? raw.bg : false,
        },
      ];
    });
  }
  const text = segment.overlay_text?.trim() ?? '';
  if (text.length === 0) return [];
  const legacy = isRecord(style) ? style : {};
  // Text the AI wrote but nobody placed: classic look, auto layout.
  const auto = autoLayoutBox(text, 0);
  return [
    {
      text,
      x: num(legacy.x, auto.x),
      y: segment.text_y ?? auto.y,
      size:
        typeof legacy.size === 'number'
          ? legacy.size / LEGACY_STAGE_WIDTH
          : auto.size,
      color: typeof legacy.color === 'string' ? legacy.color : CLASSIC_TEXT_COLOR,
      bg: typeof legacy.bg === 'boolean' ? legacy.bg : false,
    },
  ];
}

/** Legacy head trim on clip 0, used when no silence detection ran. */
export const HEAD_TRIM_MS = 150;
/** Default rule: text shows for the first 4 seconds of its clip. */
export const TEXT_HOLD_MS = 4000;
/** Shortest an overlay may stay on screen once a cue places it. */
const MIN_OVERLAY_MS = 800;
/** Longest chunk of our own subtitles per line (see renderAdapter subtitles). */
export const SUBTITLE_MAX_CHARS = 30;

export type ClipWords = { slot_index: number; words: TranscriptWord[] };

function isRecordingPath(path: string): boolean {
  return /\.(mp4|mov|m4v|webm)(\?|#|$)/i.test(path);
}

type OverlayWindow = { start_ms: number; duration_ms: number };

/**
 * Pins an overlay window inside its clip: never past the clip end, and when
 * the cue lands near the end the start moves back so it still shows for
 * MIN_OVERLAY_MS.
 */
function clipWindow(
  startMs: number,
  endMs: number,
  clipStart: number,
  clipEnd: number,
): OverlayWindow {
  const end = Math.min(endMs, clipEnd);
  const latestStart = Math.max(clipStart, end - MIN_OVERLAY_MS);
  const start = Math.min(Math.max(startMs, clipStart), latestStart);
  return { start_ms: start, duration_ms: Math.max(0, end - start) };
}

function cuedTextWindow(
  cue: SubmissionCue,
  keep: KeepRange[],
  clipStart: number,
  clipEnd: number,
  isHook: boolean,
): OverlayWindow {
  const start = isHook
    ? clipStart
    : clipStart + sourceToOutputMs(cue.text_start_ms ?? 0, keep);
  const hold = cue.text_hold_ms ?? DEFAULT_TEXT_HOLD_MS;
  return clipWindow(start, start + hold, clipStart, clipEnd);
}

function cuedImageWindow(
  cue: SubmissionCue,
  keep: KeepRange[],
  clipStart: number,
  clipEnd: number,
  isRecording: boolean,
): OverlayWindow {
  const start = clipStart + sourceToOutputMs(cue.media_start_ms ?? 0, keep);
  let end: number;
  if (cue.media_end_ms !== null) {
    end = clipStart + sourceToOutputMs(cue.media_end_ms, keep);
  } else if (isRecording) {
    end = clipEnd;
  } else {
    end = start + DEFAULT_SCREENSHOT_HOLD_MS;
  }
  return clipWindow(start, end, clipStart, clipEnd);
}

function hasWordsForEveryClip(
  words: ClipWords[] | undefined,
  count: number,
): words is ClipWords[] {
  if (!words) return false;
  for (let i = 0; i < count; i++) {
    const clip = words.find((w) => w.slot_index === i);
    if (!clip || clip.words.length === 0) return false;
  }
  return true;
}

/** Upper-frame text box position below TikTok's top tabs, used by the render adapter. */
export const TEXT_Y = 0.22;
// Lower right, clear of a talking head's face and above the subtitle block.
const IMAGE_X = 0.72;
const IMAGE_Y = 0.56;
const DEFAULT_SUBTITLES_Y = 0.72;
const IMAGE_WIDTH = 0.34;

/**
 * Build the timeline from the brief's render manifest and the real clip
 * durations captured at submit time. brief_segments and clips are matched
 * by array order (both are slot order). Timing is absolute on the stitched
 * output. With clipCuts each clip's effective length is the sum of its keep
 * ranges; without them (legacy) clip 0 loses HEAD_TRIM_MS to the head trim.
 */
export function buildRenderTimeline(params: {
  briefSegments: BriefSegmentRow[];
  durationsMs: number[];
  clipCuts?: ClipCut[];
  textOverlay?: TimelineTextOverlay;
  subtitles?: boolean;
  subtitlesY?: number;
  /** Creator or AI cue per clip; clips without one keep the clip-start timing. */
  cues?: SubmissionCue[];
  /** Transcript per clip, ms in the clip file; drives our own subtitle lines. */
  words?: ClipWords[];
  subtitleMaxChars?: number;
  width?: number;
  height?: number;
}): RenderTimeline {
  const { briefSegments, durationsMs, clipCuts, cues, words } = params;
  const textOverlay = params.textOverlay ?? DEFAULT_TEXT_OVERLAY;
  const subtitleMaxChars = params.subtitleMaxChars ?? SUBTITLE_MAX_CHARS;
  const ordered = [...briefSegments].sort((a, b) => a.slot_index - b.slot_index);

  const clips: TimelineClip[] = [];
  const texts: TimelineText[] = [];
  const images: TimelineImage[] = [];

  const count = clipCuts ? clipCuts.length : durationsMs.length;
  const ownSubtitles =
    params.subtitles === true && hasWordsForEveryClip(words, count);
  const subtitleLinesOut: SubtitleLine[] = [];
  let cursorMs = 0;
  for (let i = 0; i < count; i++) {
    const cut = clipCuts?.[i];
    const effectiveMs = cut
      ? cut.keep_ms.reduce((sum, [start, end]) => sum + Math.max(0, end - start), 0)
      : Math.max(0, durationsMs[i] - (i === 0 ? HEAD_TRIM_MS : 0));
    const keep: KeepRange[] = cut
      ? cut.keep_ms
      : [[i === 0 ? HEAD_TRIM_MS : 0, durationsMs[i]]];
    const clipEnd = cursorMs + effectiveMs;
    const cue = cues?.find((c) => c.slot_index === i);
    if (ownSubtitles) {
      const clipWords = words.find((w) => w.slot_index === i)?.words ?? [];
      subtitleLinesOut.push(
        ...subtitleLines(clipWords, keep, cursorMs, subtitleMaxChars),
      );
    }
    clips.push(
      cut
        ? {
            slot_index: i,
            duration_ms: effectiveMs,
            keep_ms: cut.keep_ms,
            source_duration_ms: cut.source_duration_ms,
          }
        : { slot_index: i, duration_ms: effectiveMs },
    );

    const segment = ordered[i];
    if (segment) {
      if (textOverlay.enabled && segment.show_on_screen) {
        const textWindow: OverlayWindow = cue
          ? cuedTextWindow(cue, keep, cursorMs, clipEnd, segment.kind === 'hook')
          : { start_ms: cursorMs, duration_ms: Math.min(TEXT_HOLD_MS, effectiveMs) };
        for (const box of segmentBoxes(segment)) {
          texts.push({
            text: box.text,
            ...textWindow,
            ...(cue ? { enter: 'pop' as const } : {}),
            y: box.y,
            box: {
              x: box.x,
              size: box.size,
              color: box.color,
              bg: box.bg,
            },
          });
        }
      }
      // Green screen screenshots are composited into the clip itself before
      // stitching, so they never join the overlay pass.
      if (segment.screenshot_url && segment.layout !== 'green_screen') {
        const imageWindow: OverlayWindow = cue
          ? cuedImageWindow(
              cue,
              keep,
              cursorMs,
              clipEnd,
              isRecordingPath(segment.screenshot_url),
            )
          : { start_ms: cursorMs, duration_ms: effectiveMs };
        images.push({
          screenshot_path: segment.screenshot_url,
          ...imageWindow,
          ...(cue ? { enter: 'slide' as const } : {}),
          x: segment.screenshot_x ?? IMAGE_X,
          y: segment.screenshot_y ?? IMAGE_Y,
          width: segment.screenshot_width ?? IMAGE_WIDTH,
        });
      }
    }

    cursorMs += effectiveMs;
  }

  return {
    width: params.width ?? 1080,
    height: params.height ?? 1920,
    text_overlay: textOverlay,
    subtitles: params.subtitles ?? false,
    subtitles_y: params.subtitlesY ?? DEFAULT_SUBTITLES_Y,
    ...(ownSubtitles ? { subtitle_lines: subtitleLinesOut } : {}),
    clips,
    texts,
    images,
  };
}

export function timelineHasOverlays(timeline: RenderTimeline): boolean {
  return (
    timeline.subtitles ||
    (timeline.subtitle_lines?.length ?? 0) > 0 ||
    timeline.texts.length > 0 ||
    timeline.images.length > 0
  );
}
