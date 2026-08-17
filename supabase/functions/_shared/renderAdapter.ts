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

const RENDERS_URL = 'https://api.creatomate.com/v1/renders';
const POLL_INTERVAL_MS = 3000;
const POLL_ATTEMPTS = 40;

// TikTok Sans is TikTok's own caption font, open sourced on Google Fonts,
// which Creatomate loads by name. Using it is what makes burned-in text read
// as native TikTok/Instagram text instead of "an edit".
const TEXT_BASE = {
  x: '50%',
  x_alignment: '50%',
  y_alignment: '50%',
  font_family: 'TikTok Sans',
  font_weight: '700',
  line_height: '128%',
} as const;

/**
 * Creatomate text properties for the admin's overlay config. Every mode is
 * ONE auto-wrapping element, exactly like a TikTok text box.
 * 'box': the classic look, a rounded background hugging each wrapped line
 * (accent is the box fill); 'outline': letters stroked with the accent;
 * 'plain': bare text with a soft shadow.
 */
// ---- Per-box styling (mirrors lib/overlay-boxes.ts on the client) ----

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

function mixHex(a: string, b: string, t: number): string | null {
  const from = parseHex(a);
  const to = parseHex(b);
  if (!from || !to) return null;
  return toHex(
    from.r + (to.r - from.r) * t,
    from.g + (to.g - from.g) * t,
    from.b + (to.b - from.b) * t,
  );
}

function luminance(hex: string): number | null {
  const p = parseHex(hex);
  if (p === null) return null;
  return (0.299 * p.r + 0.587 * p.g + 0.114 * p.b) / 255;
}

/** Pastel wash of the picked color — TikTok/Reels Classic box fill. */
function overlayBoxFill(fill: string): string {
  const lum = luminance(fill);
  if (lum == null || lum > 0.82 || lum < 0.18) return fill;
  return mixHex(fill, '#FFFFFF', 0.7) ?? fill;
}

/** Darker same-hue letters on the pastel box (white/black stay high-contrast). */
function overlayTextContrast(fill: string): string {
  const lum = luminance(fill);
  if (lum == null || lum > 0.82) return '#0F1720';
  if (lum < 0.18) return '#FFFFFF';
  return mixHex(fill, '#000000', 0.22) ?? fill;
}

/**
 * Creatomate props for one admin-placed box: exact position, exact size
 * (box.size is a fraction of the frame width, which equals vmin on a 9:16
 * frame) and the same pastel wash the composer previews.
 */
function boxTextProps(box: {
  x: number;
  size: number;
  color: string;
  bg: boolean;
}): Record<string, string> {
  const sizeVmin = `${(box.size * 100).toFixed(2)} vmin`;
  if (!box.bg) {
    return {
      ...TEXT_BASE,
      x: `${box.x * 100}%`,
      width: '86%',
      font_size: sizeVmin,
      fill_color: box.color,
      shadow_color: 'rgba(0,0,0,0.6)',
      shadow_blur: '1.2 vmin',
    };
  }
  return {
    ...TEXT_BASE,
    x: `${box.x * 100}%`,
    width: '86%',
    font_size: sizeVmin,
    fill_color: overlayTextContrast(box.color),
    background_color: overlayBoxFill(box.color),
    background_x_padding: '58%',
    background_y_padding: '42%',
    background_border_radius: '52%',
  };
}

function textProps(overlay: TimelineTextOverlay): Record<string, string> {
  if (overlay.mode === 'outline') {
    return {
      ...TEXT_BASE,
      width: '78%',
      font_weight: '800',
      font_size_maximum: '4.6 vmin',
      fill_color: overlay.text_color,
      stroke_color: overlay.accent_color,
      stroke_width: '0.4 vmin',
    };
  }
  if (overlay.mode === 'plain') {
    return {
      ...TEXT_BASE,
      width: '78%',
      font_size_maximum: '4.2 vmin',
      fill_color: overlay.text_color,
      shadow_color: 'rgba(0,0,0,0.6)',
      shadow_blur: '1.2 vmin',
    };
  }
  return {
    ...TEXT_BASE,
    width: '78%',
    font_size_maximum: '4.4 vmin',
    fill_color: overlay.text_color,
    background_color: overlay.accent_color,
    background_x_padding: '58%',
    background_y_padding: '42%',
    background_border_radius: '52%',
  };
}

type CreatomateElement = Record<string, string | number | boolean>;

type CreatomateRender = {
  id?: string;
  status?: string;
  url?: string;
  error_message?: string;
};

function toElements(params: {
  videoUrl: string;
  timeline: RenderTimeline;
  imageUrls: Record<string, string>;
}): CreatomateElement[] {
  const { videoUrl, timeline, imageUrls } = params;
  const elements: CreatomateElement[] = [
    { type: 'video', track: 1, source: videoUrl },
  ];

  const overlay = timeline.text_overlay ?? DEFAULT_TEXT_OVERLAY;
  const legacyStyle = textProps(overlay);
  for (const t of timeline.texts) {
    // One auto-wrapping element per box; newlines in the overlay text become
    // line breaks inside the same bubble, like TikTok. Boxes from the new
    // composer carry their own position, size and colors; legacy texts keep
    // the brief-level style.
    elements.push({
      type: 'text',
      text: t.text
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .join('\n'),
      time: t.start_ms / 1000,
      duration: t.duration_ms / 1000,
      y: `${(t.y ?? TEXT_Y) * 100}%`,
      ...(t.box ? boxTextProps(t.box) : legacyStyle),
    });
  }

  for (const img of timeline.images) {
    const source = imageUrls[img.screenshot_path];
    if (!source) continue;
    elements.push({
      type: 'image',
      source,
      time: img.start_ms / 1000,
      duration: img.duration_ms / 1000,
      x: `${img.x * 100}%`,
      y: `${img.y * 100}%`,
      width: `${img.width * 100}%`,
      fit: 'contain',
      border_radius: '2.5 vmin',
      shadow_color: 'rgba(0,0,0,0.4)',
      shadow_blur: '4 vmin',
    });
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
}): Promise<Uint8Array> {
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
        type: 'image',
        source: imageUrl,
        track: 1,
        duration: durationSec,
        x: '50%',
        y: '50%',
        width: '100%',
        height: '100%',
        fit: 'cover',
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
}): Promise<Uint8Array> {
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
    elements.push({
      type: 'text',
      text: box.text
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .join('\n'),
      y: `${box.y * 100}%`,
      ...boxTextProps(box),
    });
  }
  return runRender(apiKey, {
    output_format: 'jpg',
    width: 1080,
    height: 1920,
    elements,
  });
}

/**
 * Render the timeline's overlays onto the stitched video and return the MP4
 * bytes. videoUrl is a signed URL to the stitched video; imageUrls maps each
 * timeline screenshot_path to a signed URL.
 */
export async function renderOverlays(params: {
  apiKey: string;
  videoUrl: string;
  timeline: RenderTimeline;
  imageUrls: Record<string, string>;
}): Promise<Uint8Array> {
  const { apiKey, timeline } = params;
  return runRender(apiKey, {
    output_format: 'mp4',
    width: timeline.width,
    height: timeline.height,
    elements: toElements(params),
  });
}

async function runRender(
  apiKey: string,
  source: Record<string, unknown>,
): Promise<Uint8Array> {
  const createRes = await fetch(RENDERS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ source }),
  });
  const created = (await createRes.json()) as CreatomateRender[] | CreatomateRender;
  const first = Array.isArray(created) ? created[0] : created;
  if (!createRes.ok || !first?.id) {
    const detail = first?.error_message ?? JSON.stringify(created);
    throw new Error(`render create failed: ${detail}`);
  }

  let url: string | null = null;
  for (let i = 0; i < POLL_ATTEMPTS; i++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const statusRes = await fetch(`${RENDERS_URL}/${first.id}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const render = (await statusRes.json()) as CreatomateRender;
    if (render.status === 'succeeded' && render.url) {
      url = render.url;
      break;
    }
    if (render.status === 'failed') {
      throw new Error(`render failed: ${render.error_message ?? 'unknown'}`);
    }
  }
  if (!url) throw new Error('render timed out');

  const download = await fetch(url);
  if (!download.ok) throw new Error(`render download failed: ${download.status}`);
  return new Uint8Array(await download.arrayBuffer());
}
