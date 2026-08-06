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

export type RenderTimeline = {
  width: number;
  height: number;
  clips: TimelineClip[];
  texts: TimelineText[];
  images: TimelineImage[];
};

export type BriefSegmentRow = {
  slot_index: number;
  kind: string;
  overlay_text: string | null;
  show_on_screen: boolean;
  screenshot_url: string | null;
};

/** Matches the -ss 0.15 input seek on clip 0 in post-approved's FFmpeg pass. */
export const HEAD_TRIM_MS = 150;
/** Default rule: text shows for the first 3 seconds of its clip. */
export const TEXT_HOLD_MS = 3000;

/** Mid-frame text box position, used by the render adapter. */
export const TEXT_Y = 0.45;
const IMAGE_Y = 0.62;
const IMAGE_WIDTH = 0.72;

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
  width?: number;
  height?: number;
}): RenderTimeline {
  const { briefSegments, durationsMs } = params;
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
      const text = segment.overlay_text?.trim() ?? '';
      if (segment.show_on_screen && text.length > 0) {
        texts.push({
          text,
          start_ms: cursorMs,
          duration_ms: Math.min(TEXT_HOLD_MS, effectiveMs),
        });
      }
      if (segment.screenshot_url) {
        images.push({
          screenshot_path: segment.screenshot_url,
          start_ms: cursorMs,
          duration_ms: effectiveMs,
          x: 0.5,
          y: IMAGE_Y,
          width: IMAGE_WIDTH,
        });
      }
    }

    cursorMs += effectiveMs;
  }

  return {
    width: params.width ?? 1080,
    height: params.height ?? 1920,
    clips,
    texts,
    images,
  };
}

export function timelineHasOverlays(timeline: RenderTimeline): boolean {
  return timeline.texts.length > 0 || timeline.images.length > 0;
}
