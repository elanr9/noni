// Thin adapter between Noni's RenderTimeline and Creatomate. This is the ONLY
// file that knows Creatomate's request shape. If the service changes, this
// file is replaced and the pipeline stays untouched.

import { TEXT_Y, type RenderTimeline } from './renderTimeline.ts';

const RENDERS_URL = 'https://api.creatomate.com/v1/renders';
const POLL_INTERVAL_MS = 3000;
const POLL_ATTEMPTS = 40;

// The InShot / CapCut look: bold text in a solid rounded box, mid-frame.
const TEXT_STYLE = {
  width: '86%',
  x: '50%',
  x_alignment: '50%',
  y_alignment: '50%',
  font_family: 'Inter',
  font_weight: '800',
  font_size_maximum: '5.5 vmin',
  fill_color: '#111111',
  background_color: '#ffffff',
  background_x_padding: '28%',
  background_y_padding: '20%',
  background_border_radius: '22%',
} as const;

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

  for (const t of timeline.texts) {
    elements.push({
      type: 'text',
      text: t.text,
      time: t.start_ms / 1000,
      duration: t.duration_ms / 1000,
      y: `${TEXT_Y * 100}%`,
      ...TEXT_STYLE,
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
    });
  }

  return elements;
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

  const createRes = await fetch(RENDERS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      source: {
        output_format: 'mp4',
        width: timeline.width,
        height: timeline.height,
        elements: toElements(params),
      },
    }),
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
