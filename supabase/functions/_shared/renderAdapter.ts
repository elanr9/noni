// Thin adapter between Noni's RenderTimeline and Creatomate. This is the ONLY
// file that knows Creatomate's request shape. If the service changes, this
// file is replaced and the pipeline stays untouched.

import {
  DEFAULT_TEXT_OVERLAY,
  TEXT_Y,
  type RenderTimeline,
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
  const style = textProps(overlay);
  for (const t of timeline.texts) {
    // One auto-wrapping element centered on TEXT_Y; newlines in the overlay
    // text become line breaks inside the same bubble, like TikTok.
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
      ...style,
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
