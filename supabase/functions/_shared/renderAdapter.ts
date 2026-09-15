// Thin adapter between Noni's RenderTimeline and Creatomate. This is the ONLY
// file that knows Creatomate's request shape. If the service changes, this
// file is replaced and the pipeline stays untouched.

import {
  DEFAULT_TEXT_OVERLAY,
  TEXT_Y,
  type RenderTimeline,
  type SegmentBox,
  type TimelineTextOverlay,
} from './renderTimeline.ts';
import { wrapOverlayLines } from './overlayTextMetrics.ts';

const RENDERS_URL = 'https://api.creatomate.com/v1/renders';
const POLL_INTERVAL_MS = 3000;
const POLL_ATTEMPTS = 80;

// TikTok Sans is TikTok's own caption font, open sourced on Google Fonts,
// which Creatomate loads by name. Using it is what makes burned-in text read
// as native TikTok/Instagram text instead of "an edit".
const TEXT_BASE = {
  x: '50%',
  x_alignment: '50%',
  y_alignment: '50%',
  font_family: 'TikTok Sans',
  font_weight: '700',
  line_height: '115%',
} as const;

// ---- Per-box styling. Source of truth: lib/overlay-boxes.ts on the client
// (OVERLAY_TEXT_SPEC, overlayBoxFill, overlayTextContrast,
// classicOutlineColor). Edge functions cannot import from lib/, so these are
// mirrored verbatim; change both together. ----

/** TikTok text tool metrics as multiples of the font size. */
const OVERLAY_TEXT_SPEC = {
  lineHeight: 1.15,
  boxPadX: 0.55,
  boxPadY: 0.26,
  boxRadius: 0.38,
  outlineRatio: 0.075,
  maxWidth: 0.86,
} as const;

/** Creatomate background_* paddings are percent of the font size. */
const BOX_WIDTH = `${OVERLAY_TEXT_SPEC.maxWidth * 100}%`;
const BOX_PAD_X = `${OVERLAY_TEXT_SPEC.boxPadX * 100}%`;
const BOX_PAD_Y = `${OVERLAY_TEXT_SPEC.boxPadY * 100}%`;
const BOX_RADIUS = `${OVERLAY_TEXT_SPEC.boxRadius * 100}%`;

function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const raw = hex.replace('#', '').trim();
  const n =
    raw.length === 3
      ? `${raw[0]}${raw[0]}${raw[1]}${raw[1]}${raw[2]}${raw[2]}`
      : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(n)) return null;
  return {
    r: parseInt(n.slice(0, 2), 16),
    g: parseInt(n.slice(2, 4), 16),
    b: parseInt(n.slice(4, 6), 16),
  };
}

function toHex(r: number, g: number, b: number): string {
  const byte = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v)))
      .toString(16)
      .padStart(2, '0');
  return `#${byte(r)}${byte(g)}${byte(b)}`;
}

function luminance(hex: string): number | null {
  const p = parseHex(hex);
  if (p === null) return null;
  return (0.299 * p.r + 0.587 * p.g + 0.114 * p.b) / 255;
}

function toHsl(hex: string): { h: number; s: number; l: number } | null {
  const p = parseHex(hex);
  if (p === null) return null;
  const r = p.r / 255;
  const g = p.g / 255;
  const b = p.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: ((h * 60) % 360 + 360) % 360, s, l };
}

function fromHsl(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const sector = Math.floor(h / 60) % 6;
  const rgb: [number, number, number][] = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ];
  const [r, g, b] = rgb[sector] ?? [0, 0, 0];
  return toHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

/** Below this the pick is a grey and keeps its own tone. */
const NEUTRAL_SATURATION = 0.12;

/** TikTok colored bubble fill: the picked hue lifted to a light saturated tint. */
function overlayBoxFill(fill: string): string {
  const hsl = toHsl(fill);
  if (hsl === null) return fill;
  if (hsl.s < NEUTRAL_SATURATION) return hsl.l >= 0.5 ? '#FFFFFF' : '#000000';
  return fromHsl(hsl.h, Math.max(hsl.s, 0.9), 0.71);
}

/** Letters on the bubble: the same hue driven deep and fully saturated. */
function overlayTextContrast(fill: string): string {
  const hsl = toHsl(fill);
  if (hsl === null) return '#0F1720';
  if (hsl.s < NEUTRAL_SATURATION) return hsl.l >= 0.5 ? '#000000' : '#FFFFFF';
  return fromHsl(hsl.h, 1, 0.24);
}

/** Classic outline sits behind the letters in the opposite tone. */
function classicOutlineColor(textColor: string): string {
  const lum = luminance(textColor);
  return lum !== null && lum < 0.5 ? '#FFFFFF' : '#000000';
}

/** Frame aspect: box.size is a fraction of the frame width, y is of height. */
const FRAME_ASPECT = 1080 / 1920;

/**
 * Elements for one admin-placed box, wrapped here with the font's own
 * metrics so the lines break exactly where the app preview breaks them.
 * Classic is a single hugging element with hard line breaks. A colored box
 * is one hugging element per line, each with its own background, stacked at
 * the line pitch so the bubbles overlap by the pad and read as one shape,
 * the way TikTok draws it.
 */
function boxElements(
  box: { x: number; size: number; color: string; bg: boolean },
  text: string,
  yCenter: number,
  timing: Record<string, number>,
): CreatomateElement[] {
  const maxEm = (OVERLAY_TEXT_SPEC.maxWidth - 2 * box.size * OVERLAY_TEXT_SPEC.boxPadX) / box.size;
  const lines = wrapOverlayLines(text, maxEm);
  const sizeVmin = `${(box.size * 100).toFixed(2)} vmin`;
  const base = {
    type: 'text',
    ...TEXT_BASE,
    ...timing,
    x: `${box.x * 100}%`,
    font_size: sizeVmin,
    text_wrap: false,
  };
  if (!box.bg) {
    return [
      {
        ...base,
        text: lines.join('\n'),
        y: `${yCenter * 100}%`,
        fill_color: box.color,
        stroke_color: classicOutlineColor(box.color),
        stroke_width: `${(box.size * 100 * OVERLAY_TEXT_SPEC.outlineRatio).toFixed(2)} vmin`,
        shadow_color: 'rgba(0,0,0,0.35)',
        shadow_blur: '0.8 vmin',
      },
    ];
  }
  const pitch = box.size * OVERLAY_TEXT_SPEC.lineHeight * FRAME_ASPECT;
  const firstY = yCenter - ((lines.length - 1) / 2) * pitch;
  const rows = lines
    .map((line, i) => ({ line, y: `${((firstY + i * pitch) * 100).toFixed(3)}%` }))
    .filter(({ line }) => line.length > 0);
  // Bubbles overlap by the pad, so every bubble goes down first (invisible
  // letters size it) and the ink is drawn in a second pass on top. Otherwise
  // a lower bubble would cover the descenders of the line above.
  const bubbles = rows.map(({ line, y }) => ({
    ...base,
    text: line,
    y,
    fill_color: 'rgba(0,0,0,0)',
    background_color: overlayBoxFill(box.color),
    background_x_padding: BOX_PAD_X,
    background_y_padding: BOX_PAD_Y,
    background_border_radius: BOX_RADIUS,
  }));
  const ink = rows.map(({ line, y }) => ({
    ...base,
    text: line,
    y,
    fill_color: overlayTextContrast(box.color),
  }));
  return [...bubbles, ...ink];
}

/**
 * Legacy brief-level overlay config (no per-box colors). Every mode is ONE
 * auto-wrapping element; geometry follows OVERLAY_TEXT_SPEC, colors stay.
 */
function textProps(overlay: TimelineTextOverlay): Record<string, string> {
  if (overlay.mode === 'outline') {
    return {
      ...TEXT_BASE,
      width: BOX_WIDTH,
      font_size_maximum: '4.6 vmin',
      fill_color: overlay.text_color,
      stroke_color: overlay.accent_color,
      stroke_width: `${(4.6 * OVERLAY_TEXT_SPEC.outlineRatio).toFixed(2)} vmin`,
    };
  }
  if (overlay.mode === 'plain') {
    return {
      ...TEXT_BASE,
      width: BOX_WIDTH,
      font_size_maximum: '4.2 vmin',
      fill_color: overlay.text_color,
      shadow_color: 'rgba(0,0,0,0.6)',
      shadow_blur: '1.2 vmin',
    };
  }
  return {
    ...TEXT_BASE,
    width: BOX_WIDTH,
    font_size_maximum: '4.4 vmin',
    fill_color: overlay.text_color,
    background_color: overlay.accent_color,
    background_x_padding: BOX_PAD_X,
    background_y_padding: BOX_PAD_Y,
    background_border_radius: BOX_RADIUS,
  };
}

type CreatomateElement = {
  [key: string]: string | number | boolean | CreatomateElement[];
};

/** Name Creatomate uses to link the subtitle element to the stitched video. */
const STITCHED_VIDEO_NAME = 'stitched';

// Instagram Reels caption geometry, measured from native reels on a 9:16
// frame: block centered at 78% of the height, about 62% of the width, 4.8
// vmin semibold white with a soft dark shadow and no stroke. Short chunks
// (about 40 characters) wrap to exactly two lines at that width, and the
// fixed two-line height pins the block in place whether a chunk fills one
// line or two; a rare third line is clipped instead of moving the block.
const SUBTITLE_FONT_SIZE_VMIN = 4.8;
const SUBTITLE_LINE_HEIGHT = 1.25;
const SUBTITLE_MAX_CHARS = 40;
const SUBTITLE_WIDTH = 0.62;
const SUBTITLE_Y = 0.78;

/**
 * Talking-head subtitles: auto-transcribed by Creatomate from the stitched
 * video's audio, styled and placed like native Reels captions. No word
 * highlight: the effect color matches the fill so every word reads the same.
 */
function subtitleElement(y: number = SUBTITLE_Y): CreatomateElement {
  const fill = '#FFFFFF';
  return {
    type: 'text',
    transcript_source: STITCHED_VIDEO_NAME,
    transcript_effect: 'color',
    transcript_color: fill,
    transcript_split: 'line',
    transcript_placement: 'static',
    transcript_maximum_length: SUBTITLE_MAX_CHARS,
    ...TEXT_BASE,
    font_weight: '600',
    y: `${y * 100}%`,
    width: `${SUBTITLE_WIDTH * 100}%`,
    height: `${(SUBTITLE_FONT_SIZE_VMIN * SUBTITLE_LINE_HEIGHT * 2).toFixed(2)} vmin`,
    text_clip: true,
    line_height: `${SUBTITLE_LINE_HEIGHT * 100}%`,
    font_size: `${SUBTITLE_FONT_SIZE_VMIN} vmin`,
    fill_color: fill,
    shadow_color: 'rgba(0,0,0,0.75)',
    shadow_blur: '1.2 vmin',
    shadow_x: '0 vmin',
    shadow_y: '0.15 vmin',
  };
}

type CreatomateRender = {
  id?: string;
  status?: string;
  url?: string;
  error_message?: string;
  width?: number;
  height?: number;
};

/**
 * Creatomate's free plan silently clamps output to 480px. A clamped file
 * would be stored and posted as the final, so treat it as a failed render.
 */
function assertFullResolution(
  render: CreatomateRender,
  want: { width: unknown; height: unknown },
): void {
  const wantW = want.width;
  const wantH = want.height;
  if (typeof wantW !== 'number' || typeof wantH !== 'number') return;
  if (typeof render.width !== 'number' || typeof render.height !== 'number') return;
  if (render.width >= wantW && render.height >= wantH) return;
  throw new Error(
    `render came back at ${render.width}x${render.height}, expected ${wantW}x${wantH}. ` +
      'Creatomate clamps free plan renders to 480px; the account needs a paid plan.',
  );
}

export function isVideoSource(path: string): boolean {
  return /\.(mp4|mov|m4v|webm)(\?|#|$)/i.test(path);
}

function toElements(params: {
  videoUrl: string;
  timeline: RenderTimeline;
  imageUrls: Record<string, string>;
}): CreatomateElement[] {
  const { videoUrl, timeline, imageUrls } = params;
  const elements: CreatomateElement[] = [
    { type: 'video', track: 1, name: STITCHED_VIDEO_NAME, source: videoUrl },
  ];

  if (timeline.subtitles) {
    elements.push(subtitleElement(timeline.subtitles_y ?? SUBTITLE_Y));
  }

  const overlay = timeline.text_overlay ?? DEFAULT_TEXT_OVERLAY;
  const legacyStyle = textProps(overlay);
  for (const t of timeline.texts) {
    const timing = { time: t.start_ms / 1000, duration: t.duration_ms / 1000 };
    if (t.box) {
      elements.push(...boxElements(t.box, t.text, t.y ?? TEXT_Y, timing));
      continue;
    }
    elements.push({
      type: 'text',
      text: t.text
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .join('\n'),
      ...timing,
      y: `${(t.y ?? TEXT_Y) * 100}%`,
      ...legacyStyle,
    });
  }

  for (const img of timeline.images) {
    const source = imageUrls[img.screenshot_path];
    if (!source) continue;
    const time = img.start_ms / 1000;
    const duration = img.duration_ms / 1000;
    const placement = {
      source,
      x: `${img.x * 100}%`,
      y: `${img.y * 100}%`,
      width: `${img.width * 100}%`,
      fit: 'contain',
      border_radius: '2.5 vmin',
      shadow_color: 'rgba(0,0,0,0.4)',
      shadow_blur: '4 vmin',
    };
    // Screen recordings play muted once from the clip's start and vanish at
    // their natural end (no duration = source length). The wrapping
    // composition owns the clip window, so a recording longer than the clip
    // is cut where the clip ends; the creator's audio stays.
    elements.push(
      isVideoSource(img.screenshot_path)
        ? {
            type: 'composition',
            time,
            duration,
            x: '50%',
            y: '50%',
            width: '100%',
            height: '100%',
            elements: [
              { type: 'video', ...placement, time: 0, loop: false, volume: '0%' },
            ],
          }
        : { type: 'image', ...placement, time, duration },
    );
  }

  return elements;
}

// Fallback green screen geometry, used only when REPLICATE_API_TOKEN is not
// set and the creator cannot be cut out: screenshot fills the frame and the
// clip shows uncut in a circle bubble near the bottom.
export const GREEN_SCREEN_BUBBLE_WIDTH = 0.42;
export const GREEN_SCREEN_BUBBLE_Y = 0.76;

/**
 * Composite one green screen clip the fallback way: image big (cover), the
 * creator's clip in a circle bubble, audio kept. Returns the MP4 bytes; runs
 * before the stitch so the composite behaves like any other clip downstream.
 */
export async function renderGreenScreenClip(params: {
  apiKey: string;
  clipUrl: string;
  imageUrl: string;
  durationMs: number;
  width?: number;
  height?: number;
}): Promise<ReadableStream<Uint8Array>> {
  const { apiKey, clipUrl, imageUrl, durationMs } = params;
  const width = params.width ?? 1080;
  const height = params.height ?? 1920;
  const durationSec = durationMs / 1000;
  // A circle needs equal pixel sides; width and height are percentages of
  // different frame dimensions.
  const bubbleHeight = (GREEN_SCREEN_BUBBLE_WIDTH * width) / height;

  return runRender(apiKey, {
    output_format: 'mp4',
    width,
    height,
    duration: durationSec,
    elements: [
      {
        type: isVideoSource(imageUrl) ? 'video' : 'image',
        source: imageUrl,
        track: 1,
        duration: durationSec,
        x: '50%',
        y: '50%',
        width: '100%',
        height: '100%',
        fit: 'cover',
        ...(isVideoSource(imageUrl) ? { loop: true, volume: '0%' } : {}),
      },
      {
        type: 'video',
        source: clipUrl,
        track: 2,
        x: '50%',
        y: `${GREEN_SCREEN_BUBBLE_Y * 100}%`,
        width: `${GREEN_SCREEN_BUBBLE_WIDTH * 100}%`,
        height: `${bubbleHeight * 100}%`,
        fit: 'cover',
        border_radius: '50%',
        shadow_color: 'rgba(0,0,0,0.45)',
        shadow_blur: '4 vmin',
      },
    ],
  });
}

/**
 * Bake one slideshow slide: the creator's photo full frame, the admin's inset
 * picture, and the admin-placed text boxes — the same geometry the app
 * previews (SlideStage). Returns JPEG bytes at 1080x1920.
 */
export async function renderSlideImage(params: {
  apiKey: string;
  photoUrl: string;
  boxes: SegmentBox[];
  inset?: { url: string; x: number; y: number; width: number };
}): Promise<ReadableStream<Uint8Array>> {
  const { apiKey, photoUrl, boxes, inset } = params;
  const elements: CreatomateElement[] = [
    {
      type: 'image',
      source: photoUrl,
      x: '50%',
      y: '50%',
      width: '100%',
      height: '100%',
      fit: 'cover',
    },
  ];
  if (inset) {
    elements.push({
      type: 'image',
      source: inset.url,
      x: `${inset.x * 100}%`,
      y: `${inset.y * 100}%`,
      width: `${inset.width * 100}%`,
      fit: 'contain',
      border_radius: '2.5 vmin',
      shadow_color: 'rgba(0,0,0,0.4)',
      shadow_blur: '4 vmin',
    });
  }
  for (const box of boxes) {
    elements.push(...boxElements(box, box.text, box.y, {}));
  }
  return runRender(apiKey, {
    output_format: 'jpg',
    width: 1080,
    height: 1920,
    elements,
  });
}

/**
 * Kick off the overlay render on Creatomate and return its id. The caller
 * waits on it with awaitRender, possibly from a later invocation.
 */
export async function startOverlayRender(params: {
  apiKey: string;
  videoUrl: string;
  timeline: RenderTimeline;
  imageUrls: Record<string, string>;
}): Promise<string> {
  const { apiKey, timeline } = params;
  return createRender(apiKey, {
    output_format: 'mp4',
    width: timeline.width,
    height: timeline.height,
    elements: toElements(params),
  });
}

// Creatomate allows about 30 requests per 10 seconds per key and answers
// 429 with plain text. A slideshow bakes every slide in parallel, so back off
// and retry instead of failing the whole post.
const RATE_LIMIT_RETRY_MS = 4000;
const RATE_LIMIT_ATTEMPTS = 8;

async function creatomateFetch(
  url: string,
  init: RequestInit,
): Promise<{ ok: boolean; body: unknown }> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, init);
    if (res.status === 429 && attempt < RATE_LIMIT_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, RATE_LIMIT_RETRY_MS * (attempt + 1)));
      continue;
    }
    const text = await res.text();
    try {
      return { ok: res.ok, body: JSON.parse(text) as unknown };
    } catch {
      throw new Error(`Creatomate ${res.status}: ${text.slice(0, 200)}`);
    }
  }
}

// Resolves to the finished render as a byte stream so callers can pipe it
// into storage without holding a whole video in memory.
async function runRender(
  apiKey: string,
  source: Record<string, unknown>,
): Promise<ReadableStream<Uint8Array>> {
  const renderId = await createRender(apiKey, source);
  const want = { width: source.width, height: source.height };
  const stream = await awaitRender(
    apiKey,
    renderId,
    want,
    Date.now() + POLL_ATTEMPTS * POLL_INTERVAL_MS,
  );
  if (!stream) throw new Error('render timed out');
  return stream;
}

async function createRender(
  apiKey: string,
  source: Record<string, unknown>,
): Promise<string> {
  const createRes = await creatomateFetch(RENDERS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ source }),
  });
  const created = createRes.body as CreatomateRender[] | CreatomateRender;
  const first = Array.isArray(created) ? created[0] : created;
  if (!createRes.ok || !first?.id) {
    const detail = first?.error_message ?? JSON.stringify(created);
    throw new Error(`render create failed: ${detail}`);
  }
  return first.id;
}

/**
 * Poll a render until it finishes or deadlineAt passes. Resolves to the
 * finished file as a byte stream, or null when it is still in progress at
 * the deadline so the caller can pick it up later.
 */
export async function awaitRender(
  apiKey: string,
  renderId: string,
  want: { width: unknown; height: unknown },
  deadlineAt: number,
): Promise<ReadableStream<Uint8Array> | null> {
  let url: string | null = null;
  while (Date.now() < deadlineAt) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const statusRes = await creatomateFetch(`${RENDERS_URL}/${renderId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const render = statusRes.body as CreatomateRender;
    if (render.status === 'succeeded' && render.url) {
      assertFullResolution(render, want);
      url = render.url;
      break;
    }
    if (render.status === 'failed') {
      throw new Error(`render failed: ${render.error_message ?? 'unknown'}`);
    }
  }
  if (!url) return null;

  const download = await fetch(url);
  if (!download.ok || !download.body) {
    throw new Error(`render download failed: ${download.status}`);
  }
  return download.body;
}
