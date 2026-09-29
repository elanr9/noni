// ffmpeg replacement for the Creatomate overlay pass. Text and subtitles are
// burned by libass from an ASS script that mirrors renderAdapter's toElements
// pixel for pixel; screenshots and screen recordings are composited with
// overlay chains. Both artefacts are plain text, so they travel as files to
// Upload-Post like the stitch graph does.

import {
  DEFAULT_TEXT_OVERLAY,
  TEXT_Y,
  type RenderTimeline,
  type TimelineEnter,
  type TimelineImage,
} from './renderTimeline.ts';
import type { SubtitleLine } from './cues.ts';
import {
  classicOutlineColor,
  OVERLAY_TEXT_SPEC,
  overlayBoxFill,
  overlayTextContrast,
  slideDirectionFromNearestSide,
  SUBTITLE_FONT_SIZE_VMIN,
  SUBTITLE_LINES,
  SUBTITLE_WIDTH,
  SUBTITLE_Y,
} from './renderAdapter.ts';
import { measureOverlayLine, wrapOverlayLines, type OverlayFont } from './overlayTextMetrics.ts';
import { bubbleGeometry } from './overlayBubblePath.ts';

/**
 * Upload-Post substitutes `{inputN}` only inside full_command and runs ffmpeg
 * outside the job directory, so a script cannot name the ASS file by path.
 * The script carries the whole ASS inline as a base64 data URI instead, read
 * through the `subtitles` filter (libavformat opens data: URLs).
 */
function assDataUri(ass: string): string {
  const bytes = new TextEncoder().encode(ass);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return `data\\:text/plain\\;base64\\,${btoa(binary)}`;
}

// Mirrors renderAdapter popAnimations / slideAnimations / FADE_OUT.
const POP_MS = 250;
const POP_START_SCALE = 85;
const SLIDE_MS = 350;
const FADE_OUT_MS = 200;
/** \t acceleration approximating Creatomate's quadratic-out. */
const EASE_OUT_ACCEL = 0.5;

const IMAGE_RADIUS_VMIN = 2.5;
const IMAGE_SHADOW_ALPHA = 0.4;
const IMAGE_SHADOW_BLUR_VMIN = 4;
const OUTPUT_FPS = 30;

export type FontMetrics = {
  unitsPerEm: number;
  winAscent: number;
  winDescent: number;
  hheaAscender: number;
  hheaDescender: number;
  /** Windows family name from the name table; libass matches \fn against this, not the CSS family. */
  family: string;
};

function readFamilyName(dv: DataView, nameTable: number): string {
  const count = dv.getUint16(nameTable + 2);
  const storage = nameTable + dv.getUint16(nameTable + 4);
  for (let i = 0; i < count; i++) {
    const rec = nameTable + 6 + i * 12;
    if (dv.getUint16(rec) !== 3 || dv.getUint16(rec + 6) !== 1) continue;
    const length = dv.getUint16(rec + 8);
    const offset = storage + dv.getUint16(rec + 10);
    let out = '';
    for (let j = 0; j < length; j += 2) out += String.fromCharCode(dv.getUint16(offset + j));
    return out;
  }
  throw new Error('overlay font has no Windows family name');
}

/**
 * libass sizes a font so ascender + descender (OS/2 win metrics) equals the
 * ASS font size, and centres lines on that box. Browsers size by em and use
 * hhea metrics, so both the size and the vertical centre need converting.
 */
export function readFontMetrics(ttf: Uint8Array): FontMetrics {
  const dv = new DataView(ttf.buffer, ttf.byteOffset, ttf.byteLength);
  const tables: Record<string, number> = {};
  const count = dv.getUint16(4);
  for (let i = 0; i < count; i++) {
    const rec = 12 + i * 16;
    const tag = String.fromCharCode(ttf[rec], ttf[rec + 1], ttf[rec + 2], ttf[rec + 3]);
    tables[tag] = dv.getUint32(rec + 8);
  }
  const head = tables['head'];
  const os2 = tables['OS/2'];
  const hhea = tables['hhea'];
  const name = tables['name'];
  if (head === undefined || os2 === undefined || hhea === undefined || name === undefined) {
    throw new Error('overlay font is missing head, OS/2, hhea or name tables');
  }
  return {
    unitsPerEm: dv.getUint16(head + 18),
    winAscent: dv.getUint16(os2 + 74),
    winDescent: dv.getUint16(os2 + 76),
    hheaAscender: dv.getInt16(hhea + 4),
    hheaDescender: dv.getInt16(hhea + 6),
    family: readFamilyName(dv, name),
  };
}

function assFontSize(px: number, m: FontMetrics): number {
  return (px * (m.winAscent + m.winDescent)) / m.unitsPerEm;
}

/** Pixels to add to a line's centre y so the glyphs sit where a browser puts them. */
function baselineShift(px: number, m: FontMetrics): number {
  const winCentre = (m.winAscent - m.winDescent) / 2;
  const hheaCentre = (m.hheaAscender + m.hheaDescender) / 2;
  return ((hheaCentre - winCentre) / m.unitsPerEm) * px;
}

function parseColor(color: string): { r: number; g: number; b: number; a: number } {
  const rgba = color.match(/rgba?\(([^)]+)\)/);
  if (rgba) {
    const [r = 0, g = 0, b = 0, a = 1] = rgba[1].split(',').map((v) => Number(v.trim()));
    return { r, g, b, a };
  }
  const raw = color.replace('#', '').trim();
  const hex =
    raw.length === 3 ? `${raw[0]}${raw[0]}${raw[1]}${raw[1]}${raw[2]}${raw[2]}` : raw;
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
    a: 1,
  };
}

const hex2 = (v: number): string =>
  Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0').toUpperCase();

/** CSS colour to ASS &HAABBGGRR& (AA 00 is opaque). */
function assColor(color: string): string {
  const c = parseColor(color);
  return `&H${hex2((1 - c.a) * 255)}${hex2(c.b)}${hex2(c.g)}${hex2(c.r)}&`;
}

function assTime(ms: number): string {
  const cs = Math.max(0, Math.round(ms / 10));
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
}

const px = (n: number): string => Number(n.toFixed(2)).toString();

function escapeAssText(text: string): string {
  // A zero width space after a user backslash stops libass reading \N \n \h \{ \}.
  return text
    .replace(/\\(?=[Nnh{}])/g, '\\\u200B')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}');
}

/** ASS uuencode: 3 bytes to 4 chars of 33 + 6 bits, 80 chars per line. */
function assUuencode(bytes: Uint8Array): string {
  const chars: string[] = [];
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    const rest = bytes.length - i;
    chars.push(String.fromCharCode(33 + (b0 >> 2)));
    chars.push(String.fromCharCode(33 + (((b0 & 3) << 4) | ((b1 ?? 0) >> 4))));
    if (rest > 1) chars.push(String.fromCharCode(33 + ((((b1 ?? 0) & 15) << 2) | ((b2 ?? 0) >> 6))));
    if (rest > 2) chars.push(String.fromCharCode(33 + ((b2 ?? 0) & 63)));
  }
  const lines: string[] = [];
  for (let i = 0; i < chars.length; i += 80) lines.push(chars.slice(i, i + 80).join(''));
  return lines.join('\n');
}

type Placement = {
  enter: TimelineEnter | undefined;
  /** First ASS layer of the element; its stroke pass and fill pass stack above it. */
  layer: number;
  /** Block centre and size in px; slide distance and pop origin come from these. */
  blockX: number;
  blockY: number;
  blockW: number;
  blockH: number;
  /** Centre of this particular element (a line of the block or the block itself). */
  x: number;
  y: number;
};

type Bearing = '0°' | '90°' | '180°' | '270°';

/** Start offset of a slide entrance, Creatomate bearings (0° moves right, 90° up). */
function slideOffset(direction: string, w: number, h: number): { dx: number; dy: number } {
  const bearing = direction as Bearing;
  if (bearing === '0°') return { dx: -w, dy: 0 };
  if (bearing === '180°') return { dx: w, dy: 0 };
  if (bearing === '90°') return { dx: 0, dy: h };
  return { dx: 0, dy: -h };
}

/** Position, scale and fade override tags mirroring enterAnimations. */
function motionTags(p: Placement, width: number, height: number): string {
  if (p.enter === 'pop') {
    const sx = p.blockX + (p.x - p.blockX) * (POP_START_SCALE / 100);
    const sy = p.blockY + (p.y - p.blockY) * (POP_START_SCALE / 100);
    const move =
      Math.abs(sx - p.x) < 0.01 && Math.abs(sy - p.y) < 0.01
        ? `\\pos(${px(p.x)},${px(p.y)})`
        : `\\move(${px(sx)},${px(sy)},${px(p.x)},${px(p.y)},0,${POP_MS})`;
    return (
      `${move}\\fscx${POP_START_SCALE}\\fscy${POP_START_SCALE}` +
      `\\t(0,${POP_MS},${EASE_OUT_ACCEL},\\fscx100\\fscy100)\\fad(${POP_MS},${FADE_OUT_MS})`
    );
  }
  if (p.enter === 'slide') {
    const dir = slideDirectionFromNearestSide(p.blockX / width, p.blockY / height);
    const { dx, dy } = slideOffset(dir, p.blockW, p.blockH);
    return `\\move(${px(p.x + dx)},${px(p.y + dy)},${px(p.x)},${px(p.y)},0,${SLIDE_MS})\\fad(${SLIDE_MS},${FADE_OUT_MS})`;
  }
  return `\\pos(${px(p.x)},${px(p.y)})`;
}

type TextLook = {
  font: OverlayFont;
  fontPx: number;
  fill: string;
  /** Outline colour with its full width in px; absent means no stroke. */
  stroke?: { color: string; widthPx: number };
};

type Metrics = Record<OverlayFont, FontMetrics>;

function dialogue(layer: number, startMs: number, durationMs: number, text: string): string {
  return `Dialogue: ${layer},${assTime(startMs)},${assTime(startMs + durationMs)},Default,,0,0,0,,${text}`;
}

function textStyleTags(look: TextLook, metrics: Metrics): string {
  const family = metrics[look.font].family;
  const size = assFontSize(look.fontPx, metrics[look.font]);
  const stroke = look.stroke
    ? `\\bord${px(look.stroke.widthPx)}\\3c${assColor(look.stroke.color)}`
    : '\\bord0';
  return `\\an5\\fn${family}\\fs${px(size)}\\1c${assColor(look.fill)}${stroke}\\shad0`;
}

/**
 * One line of text. Stroke and fill go out as two passes on consecutive
 * layers so every line's outline sits under every line's fill, as one
 * element's stroke does in Creatomate and TikTok.
 */
function lineEvents(params: {
  line: string;
  look: TextLook;
  metrics: Metrics;
  placement: Placement;
  timing: { startMs: number; durationMs: number };
  frame: { width: number; height: number };
}): string[] {
  const { line, look, metrics, placement, timing, frame } = params;
  if (line.length === 0) return [];
  const shift = baselineShift(look.fontPx, metrics[look.font]);
  const placed = { ...placement, y: placement.y + shift, blockY: placement.blockY + shift };
  const motion = motionTags(placed, frame.width, frame.height);
  const text = escapeAssText(line);
  const events: string[] = [];
  if (look.stroke) {
    events.push(
      dialogue(
        placement.layer + 1,
        timing.startMs,
        timing.durationMs,
        `{${textStyleTags(look, metrics)}\\1a&HFF&${motion}}${text}`,
      ),
    );
  }
  events.push(
    dialogue(
      placement.layer + 2,
      timing.startMs,
      timing.durationMs,
      `{${textStyleTags({ ...look, stroke: undefined }, metrics)}${motion}}${text}`,
    ),
  );
  return events;
}

/** SVG path (absolute M/L/C/Q/Z) to an ASS drawing at \p3 (quarter pixel units). */
function svgPathToAss(path: string): string {
  const tokens = path.trim().split(/[\s,]+/).filter((t) => t.length > 0);
  const q = (n: number) => Math.round(n * 4).toString();
  const out: string[] = [];
  let i = 0;
  let cur = { x: 0, y: 0 };
  let cmd = '';
  while (i < tokens.length) {
    const tok = tokens[i];
    if (/^[MLCQZ]$/.test(tok)) {
      cmd = tok;
      i++;
      if (cmd === 'Z') continue;
    }
    const n = (k: number) => Number(tokens[i + k]);
    if (cmd === 'M' || cmd === 'L') {
      cur = { x: n(0), y: n(1) };
      out.push(`${cmd === 'M' ? 'm' : 'l'} ${q(cur.x)} ${q(cur.y)}`);
      i += 2;
    } else if (cmd === 'C') {
      out.push(`b ${q(n(0))} ${q(n(1))} ${q(n(2))} ${q(n(3))} ${q(n(4))} ${q(n(5))}`);
      cur = { x: n(4), y: n(5) };
      i += 6;
    } else if (cmd === 'Q') {
      const c = { x: n(0), y: n(1) };
      const end = { x: n(2), y: n(3) };
      const c1 = { x: cur.x + (2 / 3) * (c.x - cur.x), y: cur.y + (2 / 3) * (c.y - cur.y) };
      const c2 = { x: end.x + (2 / 3) * (c.x - end.x), y: end.y + (2 / 3) * (c.y - end.y) };
      out.push(`b ${q(c1.x)} ${q(c1.y)} ${q(c2.x)} ${q(c2.y)} ${q(end.x)} ${q(end.y)}`);
      cur = end;
      i += 4;
    } else {
      throw new Error(`unsupported path token ${tok}`);
    }
  }
  return out.join(' ');
}

/** Condensed text: one hugging block, one event per wrapped line. */
function condensedEvents(params: {
  lines: string[];
  fontPx: number;
  fill: string;
  strokeColor: string;
  centreX: number;
  centreY: number;
  enter: TimelineEnter | undefined;
  timing: { startMs: number; durationMs: number };
  metrics: Metrics;
  frame: { width: number; height: number };
  layer: number;
}): string[] {
  const { lines, fontPx, metrics, frame, timing } = params;
  const pitch = fontPx * OVERLAY_TEXT_SPEC.condensed.lineHeight;
  const blockW = Math.max(0, ...lines.map((l) => measureOverlayLine(l, 'condensed'))) * fontPx;
  const blockH = lines.length * pitch;
  const firstY = params.centreY - ((lines.length - 1) / 2) * pitch;
  const look: TextLook = {
    font: 'condensed',
    fontPx,
    fill: params.fill,
    stroke: {
      color: params.strokeColor,
      widthPx: fontPx * OVERLAY_TEXT_SPEC.condensed.strokeRatio,
    },
  };
  return lines.flatMap((line, i) =>
    lineEvents({
      line,
      look,
      metrics,
      timing,
      frame,
      placement: {
        enter: params.enter,
        layer: params.layer,
        blockX: params.centreX,
        blockY: params.centreY,
        blockW,
        blockH,
        x: params.centreX,
        y: firstY + i * pitch,
      },
    }),
  );
}

/** Bubble text: merged blob drawing on a lower layer, one ink line per row. */
function bubbleEvents(params: {
  lines: string[];
  fontPx: number;
  fill: string;
  ink: string;
  centreX: number;
  centreY: number;
  enter: TimelineEnter | undefined;
  timing: { startMs: number; durationMs: number };
  metrics: Metrics;
  frame: { width: number; height: number };
  layer: number;
}): string[] {
  const { lines, fontPx, metrics, frame, timing } = params;
  const spec = OVERLAY_TEXT_SPEC.bubble;
  const blob = bubbleGeometry(
    lines.map((line) => measureOverlayLine(line, 'bubble') * fontPx),
    {
      pitch: fontPx * spec.lineHeight,
      padX: fontPx * spec.padX,
      padY: fontPx * spec.padY,
      radius: fontPx * spec.radius,
      snap: fontPx * spec.snap,
    },
  );
  const base: Placement = {
    enter: params.enter,
    layer: params.layer,
    blockX: params.centreX,
    blockY: params.centreY,
    blockW: blob.width,
    blockH: blob.height,
    x: params.centreX,
    y: params.centreY,
  };
  const shape = dialogue(
    params.layer,
    timing.startMs,
    timing.durationMs,
    `{\\an5\\1c${assColor(params.fill)}\\bord0\\shad0${motionTags(base, frame.width, frame.height)}\\p3}${svgPathToAss(blob.path)}{\\p0}`,
  );
  const pitch = fontPx * spec.lineHeight;
  const firstY = params.centreY - ((lines.length - 1) / 2) * pitch;
  const look: TextLook = { font: 'bubble', fontPx, fill: params.ink };
  const rows = lines.flatMap((line, i) =>
    lineEvents({
      line,
      look,
      metrics,
      timing,
      frame,
      placement: { ...base, y: firstY + i * pitch },
    }),
  );
  return [shape, ...rows];
}

/** The bubble blob of one text box, no ink: the text pass draws the letters. */
function bubbleShapeEvent(params: {
  lines: string[];
  fontPx: number;
  fill: string;
  centreX: number;
  centreY: number;
  timing: { startMs: number; durationMs: number };
  frame: { width: number; height: number };
}): string {
  const { lines, fontPx, frame, timing } = params;
  const spec = OVERLAY_TEXT_SPEC.bubble;
  const blob = bubbleGeometry(
    lines.map((line) => measureOverlayLine(line, 'bubble') * fontPx),
    {
      pitch: fontPx * spec.lineHeight,
      padX: fontPx * spec.padX,
      padY: fontPx * spec.padY,
      radius: fontPx * spec.radius,
      snap: fontPx * spec.snap,
    },
  );
  const base: Placement = {
    enter: undefined,
    layer: 0,
    blockX: params.centreX,
    blockY: params.centreY,
    blockW: blob.width,
    blockH: blob.height,
    x: params.centreX,
    y: params.centreY,
  };
  return dialogue(
    0,
    timing.startMs,
    timing.durationMs,
    `{\\an5\\1c${assColor(params.fill)}\\bord0\\shad0${motionTags(base, frame.width, frame.height)}\\p3}${svgPathToAss(blob.path)}{\\p0}`,
  );
}

/**
 * ASS script with only the bubble shapes of the timeline (vector drawings, no
 * fonts), burnt in the composite pass under the drawtext text pass. Empty
 * string when the timeline has no bubbles.
 */
export function buildShapeAss(timeline: RenderTimeline): string {
  const frame = { width: timeline.width, height: timeline.height };
  const vmin = Math.min(frame.width, frame.height) / 100;
  const overlay = timeline.text_overlay ?? DEFAULT_TEXT_OVERLAY;
  const events: string[] = [];
  for (const t of timeline.texts) {
    const y = t.y ?? TEXT_Y;
    const timing = { startMs: t.start_ms, durationMs: t.duration_ms };
    if (t.box) {
      if (!t.box.bg) continue;
      const fontPx = t.box.size * frame.width;
      events.push(
        bubbleShapeEvent({
          lines: wrapOverlayLines(
            t.text,
            ((t.box.width ?? OVERLAY_TEXT_SPEC.maxWidth) -
              2 * t.box.size * OVERLAY_TEXT_SPEC.bubble.padX) / t.box.size,
            'bubble',
          ),
          fontPx,
          fill: overlayBoxFill(t.box.color),
          centreX: t.box.x * frame.width,
          centreY: y * frame.height,
          timing,
          frame,
        }),
      );
      continue;
    }
    if (overlay.mode === 'outline' || overlay.mode === 'plain') continue;
    const fontPx = 4.4 * vmin;
    const text = t.text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .join('\n');
    events.push(
      bubbleShapeEvent({
        lines: wrapOverlayLines(
          text,
          (OVERLAY_TEXT_SPEC.maxWidth * frame.width) / fontPx - 2 * OVERLAY_TEXT_SPEC.bubble.padX,
          'bubble',
        ),
        fontPx,
        fill: overlay.accent_color,
        centreX: frame.width / 2,
        centreY: y * frame.height,
        timing,
        frame,
      }),
    );
  }
  if (events.length === 0) return '';
  return [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${frame.width}`,
    `PlayResY: ${frame.height}`,
    'WrapStyle: 2',
    'ScaledBorderAndShadow: yes',
    'YCbCr Matrix: None',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    'Style: Default,Arial,48,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,5,0,0,0,1',
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    ...events,
    '',
  ].join('\n');
}

function subtitleEvents(
  lines: SubtitleLine[],
  centreY: number,
  metrics: Metrics,
  frame: { width: number; height: number },
): string[] {
  const vmin = Math.min(frame.width, frame.height) / 100;
  const fontPx = SUBTITLE_FONT_SIZE_VMIN * vmin;
  const fill = '#FFFFFF';
  return lines.flatMap((line) =>
    condensedEvents({
      lines: wrapOverlayLines(line.text, (SUBTITLE_WIDTH * frame.width) / fontPx, 'condensed')
        .slice(0, SUBTITLE_LINES),
      fontPx,
      fill,
      strokeColor: classicOutlineColor(fill),
      centreX: frame.width / 2,
      centreY,
      enter: undefined,
      timing: { startMs: line.start_ms, durationMs: line.duration_ms },
      metrics,
      frame,
      layer: 0,
    }),
  );
}

/** Legacy brief-level text (no per-box style), mirroring textProps. */
function legacyTextEvents(params: {
  text: string;
  y: number;
  enter: TimelineEnter | undefined;
  timing: { startMs: number; durationMs: number };
  timeline: RenderTimeline;
  metrics: Metrics;
  layer: number;
}): string[] {
  const { timeline, metrics } = params;
  const frame = { width: timeline.width, height: timeline.height };
  const overlay = timeline.text_overlay ?? DEFAULT_TEXT_OVERLAY;
  const vmin = Math.min(frame.width, frame.height) / 100;
  const centreX = frame.width / 2;
  const centreY = params.y * frame.height;
  const text = params.text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join('\n');
  const shared = {
    centreX,
    centreY,
    enter: params.enter,
    timing: params.timing,
    metrics,
    frame,
    layer: params.layer,
  };
  if (overlay.mode === 'outline' || overlay.mode === 'plain') {
    const fontPx = (overlay.mode === 'outline' ? 4.6 : 4.2) * vmin;
    return condensedEvents({
      ...shared,
      lines: wrapOverlayLines(text, (OVERLAY_TEXT_SPEC.maxWidth * frame.width) / fontPx, 'condensed'),
      fontPx,
      fill: overlay.text_color,
      strokeColor:
        overlay.mode === 'outline' ? overlay.accent_color : classicOutlineColor(overlay.text_color),
    });
  }
  const fontPx = 4.4 * vmin;
  const padX = OVERLAY_TEXT_SPEC.bubble.padX;
  return bubbleEvents({
    ...shared,
    lines: wrapOverlayLines(
      text,
      (OVERLAY_TEXT_SPEC.maxWidth * frame.width) / fontPx - 2 * padX,
      'bubble',
    ),
    fontPx,
    fill: overlay.accent_color,
    ink: overlay.text_color,
  });
}

/**
 * ASS script burning every subtitle line and text box of the timeline with
 * both TikTok Sans cuts embedded, so libass never falls back to a system font.
 */
export function buildOverlayAss(
  timeline: RenderTimeline,
  fonts: { condensed: Uint8Array; bubble: Uint8Array },
): string {
  const frame = { width: timeline.width, height: timeline.height };
  const metrics: Metrics = {
    condensed: readFontMetrics(fonts.condensed),
    bubble: readFontMetrics(fonts.bubble),
  };
  const events: string[] = [];

  const subtitlesY = (timeline.subtitles_y ?? SUBTITLE_Y) * frame.height;
  if (timeline.subtitle_lines) {
    events.push(...subtitleEvents(timeline.subtitle_lines, subtitlesY, metrics, frame));
  }

  timeline.texts.forEach((t, i) => {
    // Subtitles live on layers 0 to 2; each text element gets its own band
    // above them so later elements paint over earlier ones, as in Creatomate.
    const layer = 10 + 3 * i;
    const y = t.y ?? TEXT_Y;
    const timing = { startMs: t.start_ms, durationMs: t.duration_ms };
    if (!t.box) {
      events.push(
        ...legacyTextEvents({ text: t.text, y, enter: t.enter, timing, timeline, metrics, layer }),
      );
      return;
    }
    const box = t.box;
    const fontPx = box.size * frame.width;
    const shared = {
      fontPx,
      centreX: box.x * frame.width,
      centreY: y * frame.height,
      enter: t.enter,
      timing,
      metrics,
      frame,
      layer,
    };
    if (!box.bg) {
      events.push(
        ...condensedEvents({
          ...shared,
          lines: wrapOverlayLines(t.text, OVERLAY_TEXT_SPEC.maxWidth / box.size, 'condensed'),
          fill: box.color,
          strokeColor: classicOutlineColor(box.color),
        }),
      );
      return;
    }
    events.push(
      ...bubbleEvents({
        ...shared,
        lines: wrapOverlayLines(
          t.text,
          (OVERLAY_TEXT_SPEC.maxWidth - 2 * box.size * OVERLAY_TEXT_SPEC.bubble.padX) / box.size,
          'bubble',
        ),
        fill: overlayBoxFill(box.color),
        ink: overlayTextContrast(box.color),
      }),
    );
  });

  return [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${frame.width}`,
    `PlayResY: ${frame.height}`,
    'WrapStyle: 2',
    'ScaledBorderAndShadow: yes',
    'Kerning: yes',
    'YCbCr Matrix: None',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Default,${metrics.condensed.family},48,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,5,0,0,0,1`,
    '',
    '[Fonts]',
    `fontname: ${OVERLAY_TEXT_SPEC.condensed.file}`,
    assUuencode(fonts.condensed),
    ...(OVERLAY_TEXT_SPEC.bubble.file === OVERLAY_TEXT_SPEC.condensed.file
      ? []
      : [`fontname: ${OVERLAY_TEXT_SPEC.bubble.file}`, assUuencode(fonts.bubble)]),
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    ...events,
    '',
  ].join('\n');
}

const sec = (ms: number): string => (ms / 1000).toFixed(3);

/**
 * ffmpeg expression for the eased slide offset of an image, 1 at t=start
 * falling to 0 after SLIDE_MS with quadratic-out easing.
 */
function slideRemainder(startMs: number): string {
  const p = `min(max((t-${sec(startMs)})/${SLIDE_MS / 1000},0),1)`;
  return `pow(1-${p},2)`;
}

/** Overlay x/y expressions for one image, centred with an optional slide entrance. */
function imagePosition(
  img: TimelineImage,
  isVideo: boolean,
  frame: { width: number; height: number },
  pad: number,
): {
  x: string;
  y: string;
} {
  const cx = px(img.x * frame.width);
  const cy = px(img.y * frame.height);
  const x = `${cx}-overlay_w/2`;
  const y = `${cy}-overlay_h/2`;
  if (img.enter !== 'slide') return { x, y };
  // Creatomate slides a still by its own size; a recording lives in a full
  // frame composition whose distance is the recording's width fraction.
  const w = px(img.width * frame.width);
  // Both layers carry the shadow padding; a still slides by its own height.
  const h = isVideo ? px(img.width * frame.height) : `(overlay_h-${2 * pad})`;
  const rem = slideRemainder(img.start_ms);
  const dir = slideDirectionFromNearestSide(img.x, img.y) as Bearing;
  if (dir === '0°') return { x: `${x}-${w}*${rem}`, y };
  if (dir === '180°') return { x: `${x}+${w}*${rem}`, y };
  if (dir === '90°') return { x, y: `${y}+${h}*${rem}` };
  return { x, y: `${y}-${h}*${rem}` };
}

/**
 * filter_complex_script compositing screenshots and muted recordings onto
 * the stitched video (input 0), then burning the ASS text. `;` is fine here:
 * the script travels as a file, not inside full_command.
 */
export function buildOverlayGraph(params: {
  timeline: RenderTimeline;
  images: Array<{ index: number; isVideo: boolean }>;
  /** ASS script embedded in the graph (buildShapeAss); empty burns nothing. */
  ass: string;
  /** Filters applied to input 0 before compositing (a slide photo is conformed to the frame). */
  baseFilters?: string;
}): string {
  const { timeline, images, ass } = params;
  const frame = { width: timeline.width, height: timeline.height };
  const vmin = Math.min(frame.width, frame.height) / 100;
  const radius = px(IMAGE_RADIUS_VMIN * vmin);
  const shadowBlur = IMAGE_SHADOW_BLUR_VMIN * vmin;
  const pad = Math.ceil(shadowBlur * 2);
  // Anti-aliased rounded rectangle of the unpadded box, centred in the padded frame.
  const rounded =
    `clip(${radius}+0.5-hypot(max(abs(X+0.5-W/2)-(W/2-${pad}-${radius}),0),` +
    `max(abs(Y+0.5-H/2)-(H/2-${pad}-${radius}),0)),0,1)`;
  const chains: string[] = [];
  let base = '[0:v]';
  if (params.baseFilters) {
    chains.push(`[0:v]${params.baseFilters}[bg]`);
    base = '[bg]';
  }

  images.forEach(({ index, isVideo }, i) => {
    const img = timeline.images[i];
    if (!img) return;
    const widthPx = Math.round(img.width * frame.width / 2) * 2;
    const start = sec(img.start_ms);
    const end = sec(img.start_ms + img.duration_ms);
    const dur = sec(img.duration_ms);
    const animated = img.enter !== undefined;
    const fades = animated
      ? [
          ...(img.enter === 'slide' ? [`fade=t=in:st=0:d=${SLIDE_MS / 1000}:alpha=1`] : []),
          ...(img.enter === 'pop' ? [`fade=t=in:st=0:d=${POP_MS / 1000}:alpha=1`] : []),
          `fade=t=out:st=${sec(img.duration_ms - FADE_OUT_MS)}:d=${FADE_OUT_MS / 1000}:alpha=1`,
        ]
      : [];
    const prep = isVideo
      ? ['setpts=PTS-STARTPTS', `trim=duration=${dur}`, `fps=${OUTPUT_FPS}`]
      : animated
        ? ['loop=loop=-1:size=1:start=0', `setpts=N/(${OUTPUT_FPS}*TB)`, `trim=duration=${dur}`]
        : [];
    // Fit and pad once so picture and shadow share one box.
    const fitted = [
      ...prep,
      `scale=${widthPx}:-2`,
      'setsar=1',
      'format=gbrap',
      `pad=iw+${2 * pad}:ih+${2 * pad}:${pad}:${pad}:color=black@0`,
    ].join(',');
    chains.push(`[${index}:v]${fitted},split[fit${i}][key${i}]`);
    // Corner mask evaluated on the first frame only, then held for the stream.
    chains.push(
      `[key${i}]trim=end_frame=1,format=gray,geq=lum='255*${rounded}',` +
        `loop=loop=-1:size=1:start=0,setpts=N/(${OUTPUT_FPS}*TB)[mask${i}]`,
    );
    const timed = [...fades, ...(isVideo || animated ? [`setpts=PTS+${start}/TB`] : [])];
    chains.push(
      `[fit${i}][mask${i}]alphamerge=shortest=1` +
        `${timed.length > 0 ? `,${timed.join(',')}` : ''},split[img${i}][msk${i}]`,
    );
    chains.push(
      `[msk${i}]colorchannelmixer=rr=0:gg=0:bb=0:aa=${IMAGE_SHADOW_ALPHA},` +
        `gblur=sigma=${px(shadowBlur / 2)}[shd${i}]`,
    );
    const pos = imagePosition(img, isVideo, frame, pad);
    const common = `eof_action=${isVideo ? 'pass' : 'repeat'}:enable='between(t,${start},${end})'`;
    chains.push(`${base}[shd${i}]overlay=x='${pos.x}':y='${pos.y}':${common}[sh${i}]`);
    chains.push(`[sh${i}][img${i}]overlay=x='${pos.x}':y='${pos.y}':${common}[v${i}]`);
    base = `[v${i}]`;
  });

  chains.push(
    ass.length > 0 ? `${base}subtitles=filename='${assDataUri(ass)}'[outv]` : `${base}null[outv]`,
  );
  return chains.join(';\n');
}

/**
 * full_command baking one slideshow slide: the photo (input 0) with its inset
 * picture and text boxes burnt in, out as a single frame.
 */
export function slideCommand(params: { inputCount: number }): string {
  const inputs = Array.from({ length: params.inputCount }, (_v, i) => `-i {input${i}}`).join(' ');
  return (
    `ffmpeg -y -hide_banner ${inputs} -filter_complex_script {graph} ` +
    `-map "[outv]" -frames:v 1 -update 1 {output}`
  );
}

/** full_command for runFfmpegJob; {graph} is replaced with the script input. */
export function overlayCommand(params: { inputCount: number; hasImages: boolean }): string {
  const inputs = Array.from({ length: params.inputCount }, (_v, i) => `-i {input${i}}`).join(' ');
  return (
    `ffmpeg -y -hide_banner ${inputs} -filter_complex_script {graph} ` +
    `-map "[outv]" -map 0:a? -c:v h264_nvenc -preset p5 -cq 23 -pix_fmt yuv420p -r ${OUTPUT_FPS} ` +
    `-c:a copy -movflags +faststart${params.hasImages ? ' -shortest' : ''} {output}`
  );
}
