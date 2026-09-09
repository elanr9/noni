// Multiple draggable text boxes per clip, stored inside the existing
// brief_segments.overlay_style JSONB as { boxes: [...] } — no migration.
// Box 0 mirrors into the legacy overlay_text / text_y / style fields so the
// render pass, creator previews and older builds keep reading something sane.
import type { Json } from './types';

/** One on-screen text box. size is a FRACTION of the stage width so it means
 * the same thing on every device and in the 1080x1920 render. x/y are the
 * box center as stage fractions. */
export type OverlayBox = {
  id: string;
  text: string;
  color: string;
  bg: boolean;
  size: number;
  x: number;
  y: number;
};

/**
 * Two looks only. 'classic' is TikTok's default caption: white TikTok Sans
 * with a black outline. 'theme' is the company color washed into a pastel
 * pill with darker same hue letters. A box stores the concrete color and bg
 * flag so the render pass and creator previews never need the company row.
 */
export type OverlayTextStyle = 'classic' | 'theme';

export const CLASSIC_TEXT_COLOR = '#FFFFFF';

/** Theme fallback until the company picks a color: TikTok hot pink. */
export const DEFAULT_OVERLAY_FILL = '#EB4C89';

/** The editor stage the legacy px sizes were designed on. */
export const LEGACY_STAGE_WIDTH = 390;
export const DEFAULT_BOX_SIZE = 26 / LEGACY_STAGE_WIDTH;
export const MIN_BOX_SIZE = 13 / LEGACY_STAGE_WIDTH;
export const MAX_BOX_SIZE = 72 / LEGACY_STAGE_WIDTH;
export const DEFAULT_TEXT_Y = 0.45;

/** Auto placement (mirrored in supabase/functions/_shared/renderTimeline.ts). */
const AUTO_MIN_SIZE = 14 / LEGACY_STAGE_WIDTH;
const AUTO_MAX_SIZE = 28 / LEGACY_STAGE_WIDTH;
const AUTO_MAX_LINES = 5;
/** Average bold sans glyph width as a fraction of the font size. */
const AUTO_GLYPH_WIDTH = 0.55;
const BOX_MAX_WIDTH = 0.86;
/** First box sits in the upper third so the face stays clear, the second
 * above the subtitle band, any further box mid frame. */
const AUTO_Y_BY_INDEX = [0.3, 0.7, 0.5];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** Style of a stored box: a pill means theme, bare letters mean classic. */
export function overlayBoxStyle(box: Pick<OverlayBox, 'bg'>): OverlayTextStyle {
  return box.bg ? 'theme' : 'classic';
}

/** Concrete color and bg flag for a style. */
export function styleColors(
  style: OverlayTextStyle,
  themeColor: string | null,
): Pick<OverlayBox, 'color' | 'bg'> {
  return style === 'theme'
    ? { color: themeColor ?? DEFAULT_OVERLAY_FILL, bg: true }
    : { color: CLASSIC_TEXT_COLOR, bg: false };
}

/**
 * Size and position that read well without a human touching them: the font
 * shrinks until the text wraps to at most AUTO_MAX_LINES at the box width,
 * bounded so short hooks stay big and long points stay legible.
 */
export function autoLayoutBox(
  text: string,
  index = 0,
): Pick<OverlayBox, 'size' | 'x' | 'y'> {
  const chars = Math.max(1, text.trim().length);
  const fit = (BOX_MAX_WIDTH * AUTO_MAX_LINES) / (AUTO_GLYPH_WIDTH * chars);
  return {
    size: clamp(fit, AUTO_MIN_SIZE, AUTO_MAX_SIZE),
    x: 0.5,
    y: AUTO_Y_BY_INDEX[Math.min(index, AUTO_Y_BY_INDEX.length - 1)] ?? DEFAULT_TEXT_Y,
  };
}

/** A fresh auto placed box in the given style. */
export function newOverlayBox(params: {
  id: string;
  text: string;
  style: OverlayTextStyle;
  themeColor: string | null;
  index?: number;
}): OverlayBox {
  return {
    id: params.id,
    text: params.text,
    ...styleColors(params.style, params.themeColor),
    ...autoLayoutBox(params.text, params.index ?? 0),
  };
}

/** Company wide theme color from companies.settings.overlay_theme. */
export function parseOverlayThemeColor(settings: unknown): string | null {
  if (!isRecord(settings) || !isRecord(settings.overlay_theme)) return null;
  const hex = settings.overlay_theme.color;
  return typeof hex === 'string' && parseHex(hex) !== null ? hex : null;
}

function parseBox(value: unknown, index: number): OverlayBox | null {
  if (!isRecord(value)) return null;
  const text = typeof value.text === 'string' ? value.text : '';
  if (text.trim().length === 0) return null;
  const auto = autoLayoutBox(text, index);
  return {
    id: typeof value.id === 'string' ? value.id : `box-${index}`,
    text,
    color: typeof value.color === 'string' ? value.color : CLASSIC_TEXT_COLOR,
    bg: typeof value.bg === 'boolean' ? value.bg : false,
    size: clamp(num(value.size, auto.size), MIN_BOX_SIZE, MAX_BOX_SIZE),
    x: clamp(num(value.x, auto.x), 0.02, 0.98),
    y: clamp(num(value.y, auto.y), 0.02, 0.98),
  };
}

/** True once a segment carries composer boxes (seeded or hand placed). */
export function hasOverlayBoxes(overlayStyle: unknown): boolean {
  return (
    isRecord(overlayStyle) &&
    Array.isArray(overlayStyle.boxes) &&
    overlayStyle.boxes.some((b) => parseBox(b, 0) !== null)
  );
}

/**
 * All boxes on a segment. Reads overlay_style.boxes; when absent, falls back
 * to the legacy single-text columns so segments saved before this feature
 * still show their one box.
 */
export function parseOverlayBoxes(
  overlayStyle: unknown,
  legacy: { text: string | null | undefined; textY: number | null | undefined },
): OverlayBox[] {
  if (isRecord(overlayStyle) && Array.isArray(overlayStyle.boxes)) {
    return overlayStyle.boxes
      .map((b, i) => parseBox(b, i))
      .filter((b): b is OverlayBox => b !== null);
  }
  const text = legacy.text?.trim() ?? '';
  if (text.length === 0) return [];
  const style = isRecord(overlayStyle) ? overlayStyle : {};
  // Text the AI wrote but nobody placed: classic look, auto layout.
  const auto = autoLayoutBox(text, 0);
  return [
    {
      id: 'legacy-0',
      text,
      color: typeof style.color === 'string' ? style.color : CLASSIC_TEXT_COLOR,
      bg: typeof style.bg === 'boolean' ? style.bg : false,
      // Legacy size was device px on a ~390pt stage.
      size: clamp(
        typeof style.size === 'number'
          ? style.size / LEGACY_STAGE_WIDTH
          : auto.size,
        MIN_BOX_SIZE,
        MAX_BOX_SIZE,
      ),
      x: clamp(num(style.x, auto.x), 0.02, 0.98),
      y: clamp(legacy.textY ?? auto.y, 0.02, 0.98),
    },
  ];
}

/** overlay_style JSON for a set of boxes, with the box-0 legacy mirror. */
export function serializeOverlayBoxes(boxes: OverlayBox[]): {
  overlay_style: { [key: string]: Json | undefined };
  overlay_text: string;
  text_y: number;
  show_on_screen: boolean;
} {
  const kept = boxes.filter((b) => b.text.trim().length > 0);
  const first = kept[0];
  return {
    overlay_style: {
      boxes: kept.map((b) => ({
        id: b.id,
        text: b.text,
        color: b.color,
        bg: b.bg,
        size: b.size,
        x: b.x,
        y: b.y,
      })),
      // Legacy mirror of box 0 (px on the design stage) for old readers.
      color: first?.color ?? CLASSIC_TEXT_COLOR,
      bg: first?.bg ?? false,
      size: Math.round((first?.size ?? DEFAULT_BOX_SIZE) * LEGACY_STAGE_WIDTH),
      x: first?.x ?? 0.5,
    },
    overlay_text: first?.text ?? '',
    text_y: first?.y ?? DEFAULT_TEXT_Y,
    show_on_screen: kept.length > 0,
  };
}

function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const raw = hex.replace('#', '').trim();
  const n =
    raw.length === 3 && raw[0] && raw[1] && raw[2]
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
  const byte = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
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
export function overlayBoxFill(fill: string): string {
  const lum = luminance(fill);
  if (lum == null || lum > 0.82 || lum < 0.18) return fill;
  return mixHex(fill, '#FFFFFF', 0.7) ?? fill;
}

/** Darker same-hue letters on the pastel box (white/black stay high-contrast). */
export function overlayTextContrast(fill: string): string {
  const lum = luminance(fill);
  if (lum == null || lum > 0.82) return '#0F1720';
  if (lum < 0.18) return '#FFFFFF';
  return mixHex(fill, '#000000', 0.22) ?? fill;
}
