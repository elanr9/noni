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
  /** Wrap width as a fraction of the frame width; absent means the default maxWidth. */
  width?: number;
  /** Per word colors on a slideshow slide box (ColorSpan); absent draws the whole box in color. */
  spans?: ColorSpan[];
};

/** Narrowest and widest a text box may wrap, as a fraction of the frame width. */
export const MIN_BOX_WIDTH = 0.2;
export const MAX_BOX_WIDTH = 0.95;

/**
 * Two looks only. 'classic' is TikTok's default caption: white TikTok Sans
 * with a black outline. 'theme' is the company color washed into a pastel
 * pill with darker same hue letters. A box stores the concrete color and bg
 * flag so the render pass and creator previews never need the company row.
 */
export type OverlayTextStyle = 'classic' | 'theme';

export const CLASSIC_TEXT_COLOR = '#FFFFFF';
export const CLASSIC_BLACK_TEXT_COLOR = '#000000';

/**
 * TikTok text tool metrics, tuned against real TikTok exports. Every unit is
 * a multiple of the font size so previews at any stage width and the
 * 1080x1920 render come out identical. Both fonts are static instances cut
 * from the TikTok Sans variable font (assets/fonts, OFL). Mirrored in
 * supabase/functions/_shared/renderAdapter.ts; change both together.
 */
export const OVERLAY_TEXT_SPEC = {
  /** Bare letters: TikTok's default text, condensed white with a black stroke. */
  condensed: {
    /** TikTok Sans wght 600, wdth 100, opsz 36, slnt 0, same face as the bubble. */
    fontFamily: 'TikTokSans-Bubble',
    fontWeight: '600',
    lineHeight: 1.1,
    /** Stroke drawn fully outside the letter, as a fraction of the font size. */
    strokeRatio: 0.06,
  },
  /** Text with background: one colored bubble per line, merged into one blob. */
  bubble: {
    /** TikTok Sans wght 600, wdth 100, opsz 36, slnt 0. */
    fontFamily: 'TikTokSans-Bubble',
    fontWeight: '600',
    lineHeight: 1.15,
    padX: 0.35,
    padY: 0.12,
    radius: 0.25,
    /** Neighbouring lines whose widths differ by less than this share one width. */
    snap: 0.3,
    /** Fallback tint math for picks no measured pair covers. */
    fill: { saturation: 0.84, lightness: 0.73 },
    ink: { saturation: 1, lightness: 0.28 },
    /** Bubble and letter colors measured off TikTok, keyed by the pick's hue. */
    pairs: [{ hue: 210, fill: '#80B6F4', ink: '#000590' }],
    pairHueTolerance: 25,
  },
  /** Widest a box may wrap, as a fraction of the stage width. */
  maxWidth: 0.84,
} as const;

/**
 * Creator picks for the on-screen text. The two classic swatches keep the
 * bare outlined look; the rest become TikTok colored bubbles.
 */
export const CREATOR_TEXT_PALETTE: readonly { color: string; bg: boolean }[] = [
  { color: CLASSIC_TEXT_COLOR, bg: false },
  { color: CLASSIC_BLACK_TEXT_COLOR, bg: false },
  { color: '#FFFFFF', bg: true },
  { color: '#000000', bg: true },
  { color: '#FE2C55', bg: true },
  { color: '#FF7A1A', bg: true },
  { color: '#FFD23F', bg: true },
  { color: '#25D366', bg: true },
  { color: '#1E88F5', bg: true },
  { color: '#8A4DFF', bg: true },
  { color: '#EB4C89', bg: true },
];

/** Classic outline sits behind the letters in the opposite tone. */
export function classicOutlineColor(textColor: string): string {
  const lum = luminance(textColor);
  return lum !== null && lum < 0.5 ? '#FFFFFF' : '#000000';
}

/** Theme fallback until the company picks a color: TikTok hot pink. */
export const DEFAULT_OVERLAY_FILL = '#EB4C89';

/** The editor stage the legacy px sizes were designed on. */
export const LEGACY_STAGE_WIDTH = 390;
export const DEFAULT_BOX_SIZE = 34 / LEGACY_STAGE_WIDTH;
export const MIN_BOX_SIZE = 13 / LEGACY_STAGE_WIDTH;
export const MAX_BOX_SIZE = 72 / LEGACY_STAGE_WIDTH;
export const DEFAULT_TEXT_Y = 0.22;

/** Auto placement (mirrored in supabase/functions/_shared/renderTimeline.ts). */
const AUTO_MIN_SIZE = 20 / LEGACY_STAGE_WIDTH;
const AUTO_MAX_SIZE = 40 / LEGACY_STAGE_WIDTH;
const AUTO_MAX_LINES = 4;
/** Average bold sans glyph width as a fraction of the font size. */
const AUTO_GLYPH_WIDTH = 0.55;
const BOX_MAX_WIDTH = OVERLAY_TEXT_SPEC.maxWidth;
/** First box sits below TikTok's top tabs so the face stays clear, the second
 * above the subtitle band, any further box mid frame. */
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
    ...(typeof value.width === 'number'
      ? { width: clamp(value.width, MIN_BOX_WIDTH, MAX_BOX_WIDTH) }
      : {}),
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
        ...(b.width !== undefined ? { width: b.width } : {}),
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

function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/** The measured TikTok pair whose hue the pick falls on, if any. */
function measuredPair(hue: number): { fill: string; ink: string } | null {
  const { pairs, pairHueTolerance } = OVERLAY_TEXT_SPEC.bubble;
  const hit = pairs.find((p) => hueDistance(p.hue, hue) <= pairHueTolerance);
  return hit ?? null;
}

/**
 * TikTok colored bubble fill: the picked hue lifted to a light, still
 * saturated tint (TikTok's blue box measures #80B6F4). White and black picks
 * stay white and black, matching the platform's own swatches.
 */
export function overlayBoxFill(fill: string): string {
  const hsl = toHsl(fill);
  if (hsl === null) return fill;
  if (hsl.s < NEUTRAL_SATURATION) return hsl.l >= 0.5 ? '#FFFFFF' : '#000000';
  const pair = measuredPair(hsl.h);
  if (pair) return pair.fill;
  const { saturation, lightness } = OVERLAY_TEXT_SPEC.bubble.fill;
  return fromHsl(hsl.h, Math.max(hsl.s, saturation), lightness);
}

/**
 * Letters on the bubble: the same hue driven deep and fully saturated
 * (TikTok's blue letters measure #000590). Black on white, white on black.
 */
export function overlayTextContrast(fill: string): string {
  const hsl = toHsl(fill);
  if (hsl === null) return '#0F1720';
  if (hsl.s < NEUTRAL_SATURATION) return hsl.l >= 0.5 ? '#000000' : '#FFFFFF';
  const pair = measuredPair(hsl.h);
  if (pair) return pair.ink;
  const { saturation, lightness } = OVERLAY_TEXT_SPEC.bubble.ink;
  return fromHsl(hsl.h, saturation, lightness);
}

// ---- Per word color (Instagram stories style) ----
//
// A box may carry color spans: chars [start, end) of its text drawn in that
// color instead of the box color. Same shape as briefs-api TextSpan. The
// helpers below keep spans valid while the text is edited, split a box into
// colored runs for <Text> nesting, and map wrapped lines back to the text so
// the render can color the right glyphs on every line.

export type ColorSpan = { start: number; end: number; color?: string };

/** One stretch of text in one color. */
export type ColorRun = { text: string; color: string; start: number };

/** Pure: in range, non empty, non overlapping spans sorted by start; later spans win. */
export function normalizeSpans(spans: readonly ColorSpan[] | undefined, length: number): ColorSpan[] {
  if (!spans?.length || length <= 0) return [];
  const per: (string | undefined)[] = new Array(length).fill(undefined);
  let any = false;
  for (const sp of spans) {
    if (!sp.color) continue;
    const a = Math.max(0, Math.floor(sp.start));
    const b = Math.min(length, Math.floor(sp.end));
    for (let i = a; i < b; i++) per[i] = sp.color;
    if (b > a) any = true;
  }
  if (!any) return [];
  const out: ColorSpan[] = [];
  let i = 0;
  while (i < length) {
    const c = per[i];
    let j = i + 1;
    while (j < length && per[j] === c) j++;
    if (c) out.push({ start: i, end: j, color: c });
    i = j;
  }
  return out;
}

/** Pure: color chars [start, end) on top of the existing spans. */
export function applySpanColor(spans: readonly ColorSpan[] | undefined, length: number, start: number, end: number, color: string): ColorSpan[] {
  return normalizeSpans([...(spans ?? []), { start, end, color }], length);
}

/**
 * Pure: spans after the text changed from prev to next. The edit is found by
 * common prefix and suffix, so it works for typing, deleting, pasting over a
 * selection and autocorrect. Typed chars inside a colored run take its
 * color; chars typed at either edge of a run do not.
 */
export function shiftSpans(spans: readonly ColorSpan[] | undefined, prev: string, next: string): ColorSpan[] {
  if (!spans?.length) return [];
  if (prev === next) return normalizeSpans(spans, next.length);
  let p = 0;
  const max = Math.min(prev.length, next.length);
  while (p < max && prev[p] === next[p]) p++;
  let s = 0;
  while (s < max - p && prev[prev.length - 1 - s] === next[next.length - 1 - s]) s++;
  const removed = prev.length - p - s;
  const inserted = next.length - p - s;
  // A char at or after the edit start moves past the new text, so typing
  // right before a run does not color the typed chars.
  const mapStart = (i: number): number => (i < p ? i : Math.max(p + inserted, i - removed + inserted));
  // An end at the edit start stays, so typing right after a run does not
  // extend it; an end inside the removed chars collapses to the edit start.
  const mapEnd = (i: number): number => (i <= p ? i : i <= p + removed ? p : i - removed + inserted);
  const out: ColorSpan[] = [];
  for (const sp of spans) {
    const start = mapStart(sp.start);
    const end = mapEnd(sp.end);
    if (end > start) out.push({ ...sp, start, end });
  }
  return normalizeSpans(out, next.length);
}

/** Pure: the text as runs of one color each; unspanned chars use base. */
export function colorRuns(text: string, spans: readonly ColorSpan[] | undefined, base: string, from = 0, to = text.length): ColorRun[] {
  const norm = normalizeSpans(spans, text.length);
  const out: ColorRun[] = [];
  let i = from;
  while (i < to) {
    const sp = norm.find((x) => x.start <= i && x.end > i);
    const nextStart = norm.find((x) => x.start > i)?.start ?? to;
    const j = Math.min(to, sp ? sp.end : nextStart);
    const c = sp?.color ?? base;
    const last = out[out.length - 1];
    if (last && last.color === c) last.text += text.slice(i, j);
    else out.push({ text: text.slice(i, j), color: c, start: i });
    i = j;
  }
  return out;
}

/**
 * Pure: for each wrapped line, the index in text of each of its chars.
 * Wrapping collapses runs of whitespace into one space, so a space maps to
 * the first whitespace char it stands for. Lines must come from wrapping text.
 */
export function lineCharIndices(text: string, lines: readonly string[]): number[][] {
  const space = (c: string | undefined): boolean => c !== undefined && /\s/.test(c);
  let k = 0;
  return lines.map((line) => {
    const idx: number[] = [];
    // Skip whitespace (and the newline) between lines.
    while (k < text.length && space(text[k])) k++;
    for (let ci = 0; ci < line.length; ci++) {
      const ch = line[ci];
      if (space(ch)) {
        idx.push(Math.min(k, text.length - 1));
        while (k < text.length && space(text[k])) k++;
        continue;
      }
      while (k < text.length && text[k] !== ch) k++;
      idx.push(Math.min(k, text.length - 1));
      k++;
    }
    return idx;
  });
}

/** Pure: each wrapped line as color runs, for renders that draw line by line. */
export function lineColorRuns(text: string, lines: readonly string[], spans: readonly ColorSpan[] | undefined, base: string): ColorRun[][] {
  const norm = normalizeSpans(spans, text.length);
  const colorAt = (i: number): string => norm.find((x) => x.start <= i && x.end > i)?.color ?? base;
  const indices = lineCharIndices(text, lines);
  return lines.map((line, li) => {
    const out: ColorRun[] = [];
    for (let ci = 0; ci < line.length; ci++) {
      const ch = line[ci];
      const src = indices[li][ci] ?? 0;
      // A space takes the color of the char before it so runs stay whole words.
      const c = /\s/.test(ch) && out.length ? out[out.length - 1].color : colorAt(src);
      const last = out[out.length - 1];
      if (last && last.color === c) last.text += ch;
      else out.push({ text: ch, color: c, start: src });
    }
    return out;
  });
}
