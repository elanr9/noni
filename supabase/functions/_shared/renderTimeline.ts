// Noni's own render timeline. This is the pipeline's canonical shape;
// whichever render service we use sits behind a thin adapter that consumes
// this object. Swap the adapter, never the pipeline.

export type TimelineClip = {
  slot_index: number;
  /** Effective duration on the stitched output, after the head trim. */
  duration_ms: number;
};

export type TimelineText = {
  text: string;
  start_ms: number;
  duration_ms: number;
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
  clips: TimelineClip[];
  texts: TimelineText[];
  images: TimelineImage[];
};

export type BriefSegmentRow = {
  slot_index: number;
  kind: string;
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
const DEFAULT_BOX_SIZE = 26 / LEGACY_STAGE_WIDTH;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

/** Text boxes for one segment: overlay_style.boxes, else the legacy columns. */
function segmentBoxes(
  segment: BriefSegmentRow,
): { text: string; x: number; y: number; size: number; color: string; bg: boolean }[] {
  const style = segment.overlay_style;
  if (isRecord(style) && Array.isArray(style.boxes)) {
    return style.boxes.flatMap((raw) => {
      if (!isRecord(raw)) return [];
      const text = typeof raw.text === 'string' ? raw.text.trim() : '';
      if (text.length === 0) return [];
      return [
        {
          text,
          x: num(raw.x, 0.5),
          y: num(raw.y, TEXT_Y),
          size: num(raw.size, DEFAULT_BOX_SIZE),
          color: typeof raw.color === 'string' ? raw.color : '#EB4C89',
          bg: typeof raw.bg === 'boolean' ? raw.bg : true,
        },
      ];
    });
  }
  const text = segment.overlay_text?.trim() ?? '';
  if (text.length === 0) return [];
  const legacy = isRecord(style) ? style : {};
  return [
    {
      text,
      x: num(legacy.x, 0.5),
      y: segment.text_y ?? TEXT_Y,
      size: num(legacy.size, 26) / LEGACY_STAGE_WIDTH,
      color: typeof legacy.color === 'string' ? legacy.color : '#EB4C89',
      bg: typeof legacy.bg === 'boolean' ? legacy.bg : true,
    },
  ];
}

/** Matches the -ss 0.15 input seek on clip 0 in post-approved's FFmpeg pass. */
export const HEAD_TRIM_MS = 150;
/** Default rule: text shows for the first 3 seconds of its clip. */
export const TEXT_HOLD_MS = 3000;

/** Mid-frame text box position, used by the render adapter. */
export const TEXT_Y = 0.45;
const IMAGE_Y = 0.62;
const IMAGE_WIDTH = 0.85;

/**
 * Build the timeline from the brief's render manifest and the real clip
 * durations captured at submit time. brief_segments and clips are matched
 * by array order (both are slot order). Timing is absolute on the stitched
 * output: clip 0 loses HEAD_TRIM_MS to the head trim; the tail silence trim
 * only shortens the final clip and never shifts a start.
 */
export function buildRenderTimeline(params: {
  briefSegments: BriefSegmentRow[];
  durationsMs: number[];
  textOverlay?: TimelineTextOverlay;
  width?: number;
  height?: number;
}): RenderTimeline {
  const { briefSegments, durationsMs } = params;
  const textOverlay = params.textOverlay ?? DEFAULT_TEXT_OVERLAY;
  const ordered = [...briefSegments].sort((a, b) => a.slot_index - b.slot_index);

  const clips: TimelineClip[] = [];
  const texts: TimelineText[] = [];
  const images: TimelineImage[] = [];

  let cursorMs = 0;
  for (let i = 0; i < durationsMs.length; i++) {
    const effectiveMs = Math.max(0, durationsMs[i] - (i === 0 ? HEAD_TRIM_MS : 0));
    clips.push({ slot_index: i, duration_ms: effectiveMs });

    const segment = ordered[i];
    if (segment) {
      if (textOverlay.enabled && segment.show_on_screen) {
        for (const box of segmentBoxes(segment)) {
          texts.push({
            text: box.text,
            start_ms: cursorMs,
            duration_ms: Math.min(TEXT_HOLD_MS, effectiveMs),
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
        images.push({
          screenshot_path: segment.screenshot_url,
          start_ms: cursorMs,
          duration_ms: effectiveMs,
          x: segment.screenshot_x ?? 0.5,
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
    clips,
    texts,
    images,
  };
}

export function timelineHasOverlays(timeline: RenderTimeline): boolean {
  return timeline.texts.length > 0 || timeline.images.length > 0;
}
