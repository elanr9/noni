// Text pass for the ffmpeg render: every title, bubble ink line and subtitle
// line is one drawtext filter in a single -vf chain. Upload-Post's libass
// ignores fonts embedded in an ASS script, but drawtext takes the TTF by path
// and full_command is the one place {inputN} placeholders are substituted,
// so the chain has to live inline in the command. Bubble shapes and pictures
// are composited by ffmpegOverlay's graph in a pass before this one.

import { DEFAULT_TEXT_OVERLAY, TEXT_Y, type RenderTimeline } from './renderTimeline.ts';
import {
  classicOutlineColor,
  OVERLAY_TEXT_SPEC,
  overlayTextContrast,
  SUBTITLE_FONT_SIZE_VMIN,
  SUBTITLE_LINES,
  SUBTITLE_WIDTH,
  SUBTITLE_Y,
} from './renderAdapter.ts';
import { wrapCaptionLines, wrapOverlayLines, type OverlayFont } from './overlayTextMetrics.ts';
import { readFontMetrics, type FontMetrics } from './ffmpegOverlay.ts';

/** Characters Upload-Post rejects anywhere in full_command. */
const FORBIDDEN_IN_COMMAND = /[;|&$`]/;

const px = (n: number): string => Number(n.toFixed(2)).toString();

/** `#RRGGBB` (or `#RRGGBBAA`) to drawtext's `0xRRGGBB[@alpha]`. */
function drawtextColor(color: string): string {
  const raw = color.replace('#', '').trim();
  if (raw.length === 8) {
    const alpha = parseInt(raw.slice(6, 8), 16) / 255;
    return `0x${raw.slice(0, 6)}@${alpha.toFixed(3)}`;
  }
  return `0x${raw.slice(0, 6)}`;
}

/**
 * Escapes a line for `text=…` in the double-quoted -vf argument. Three
 * parsers see it in turn: a POSIX shell lexer (inside double quotes only
 * `\\` `\"` `\$` and a backtick are escapes), ffmpeg's graph tokenizer
 * (`\x` is x, `'…'` is literal) and the option tokenizer (same rules, `:`
 * terminates). Every character is backslash-escaped so no word survives
 * intact in the command: Upload-Post rejects substrings like `rm` anywhere.
 */
function escapeDrawtextText(line: string): string {
  let out = '';
  for (const ch of line) {
    if (ch === '\\') out += '\\\\\\\\\\\\\\\\';
    else if (ch === ':' || ch === "'") out += `\\\\\\\\\\${ch}`;
    else if (ch === '"') out += '\\"';
    else out += `\\${ch}`;
  }
  return out;
}

type Line = {
  text: string;
  font: OverlayFont;
  fontPx: number;
  fill: string;
  /** Outline colour; absent draws bare glyphs. */
  stroke?: string;
  /** Horizontal centre in px. */
  centreX: number;
  /** Vertical centre of the line box in px, browser line-box semantics. */
  centreY: number;
  startMs: number;
  durationMs: number;
};

/**
 * drawtext puts the baseline at y + ascent, where ascent is the tallest glyph
 * of the string; the expression `B-ascent` pins the baseline to B for every
 * line. B is where a browser line box centred on centreY puts its baseline.
 */
function baselineY(centreY: number, fontPx: number, m: FontMetrics): number {
  return centreY + ((m.hheaAscender + m.hheaDescender) / 2 / m.unitsPerEm) * fontPx;
}

export type DrawtextPlan = {
  /** The -vf chain; empty when the timeline has no text. */
  vf: string;
  /** Contents of text files the chain reads through `textfile=`; index i is placeholder textfilePlaceholder(i). */
  textfiles: string[];
};

/**
 * Builds the drawtext chain. `fontPlaceholder` is the `{inputN}` token of the
 * TTF; `textfilePlaceholder(i)` the token for the i-th text file, used for
 * lines Upload-Post would reject inline.
 */
export function buildDrawtextChain(params: {
  timeline: RenderTimeline;
  font: Uint8Array;
  fontPlaceholder: string;
  textfilePlaceholder: (index: number) => string;
  /** Filters to run before the text, e.g. the slide conform; joined with commas. */
  prefix?: string[];
}): DrawtextPlan {
  const { timeline, fontPlaceholder, textfilePlaceholder } = params;
  const metrics = readFontMetrics(params.font);
  const frame = { width: timeline.width, height: timeline.height };
  const vmin = Math.min(frame.width, frame.height) / 100;
  const lines: Line[] = [];

  const pushBlock = (block: {
    wrapped: string[];
    font: OverlayFont;
    fontPx: number;
    fill: string;
    stroke?: string;
    centreX: number;
    centreY: number;
    startMs: number;
    durationMs: number;
  }) => {
    const pitch = block.fontPx * OVERLAY_TEXT_SPEC[block.font].lineHeight;
    const firstY = block.centreY - ((block.wrapped.length - 1) / 2) * pitch;
    block.wrapped.forEach((text, i) => {
      if (text.length === 0) return;
      lines.push({
        text,
        font: block.font,
        fontPx: block.fontPx,
        fill: block.fill,
        stroke: block.stroke,
        centreX: block.centreX,
        centreY: firstY + i * pitch,
        startMs: block.startMs,
        durationMs: block.durationMs,
      });
    });
  };

  if (timeline.subtitle_lines) {
    const fontPx = SUBTITLE_FONT_SIZE_VMIN * vmin;
    const centreY = (timeline.subtitles_y ?? SUBTITLE_Y) * frame.height;
    for (const line of timeline.subtitle_lines) {
      pushBlock({
        wrapped: wrapCaptionLines(line.text, (SUBTITLE_WIDTH * frame.width) / fontPx, 'condensed')
          .slice(0, SUBTITLE_LINES),
        font: 'condensed',
        fontPx,
        fill: '#FFFFFF',
        stroke: classicOutlineColor('#FFFFFF'),
        centreX: frame.width / 2,
        centreY,
        startMs: line.start_ms,
        durationMs: line.duration_ms,
      });
    }
  }

  const overlay = timeline.text_overlay ?? DEFAULT_TEXT_OVERLAY;
  for (const t of timeline.texts) {
    const y = t.y ?? TEXT_Y;
    const timing = { startMs: t.start_ms, durationMs: t.duration_ms };
    if (t.box) {
      const fontPx = t.box.size * frame.width;
      const centreX = t.box.x * frame.width;
      const wrapWidth = t.box.width ?? OVERLAY_TEXT_SPEC.maxWidth;
      if (t.box.bg) {
        pushBlock({
          wrapped: wrapOverlayLines(
            t.text,
            (wrapWidth - 2 * t.box.size * OVERLAY_TEXT_SPEC.bubble.padX) / t.box.size,
            'bubble',
          ),
          font: 'bubble',
          fontPx,
          fill: overlayTextContrast(t.box.color),
          centreX,
          centreY: y * frame.height,
          ...timing,
        });
      } else {
        pushBlock({
          wrapped: wrapOverlayLines(t.text, wrapWidth / t.box.size, 'condensed'),
          font: 'condensed',
          fontPx,
          fill: t.box.color,
          stroke: classicOutlineColor(t.box.color),
          centreX,
          centreY: y * frame.height,
          ...timing,
        });
      }
      continue;
    }
    // Legacy brief-level text, mirroring textProps.
    const text = t.text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .join('\n');
    if (overlay.mode === 'outline' || overlay.mode === 'plain') {
      const fontPx = (overlay.mode === 'outline' ? 4.6 : 4.2) * vmin;
      pushBlock({
        wrapped: wrapOverlayLines(text, (OVERLAY_TEXT_SPEC.maxWidth * frame.width) / fontPx, 'condensed'),
        font: 'condensed',
        fontPx,
        fill: overlay.text_color,
        stroke:
          overlay.mode === 'outline' ? overlay.accent_color : classicOutlineColor(overlay.text_color),
        centreX: frame.width / 2,
        centreY: y * frame.height,
        ...timing,
      });
    } else {
      const fontPx = 4.4 * vmin;
      pushBlock({
        wrapped: wrapOverlayLines(
          text,
          (OVERLAY_TEXT_SPEC.maxWidth * frame.width) / fontPx - 2 * OVERLAY_TEXT_SPEC.bubble.padX,
          'bubble',
        ),
        font: 'bubble',
        fontPx,
        fill: overlay.text_color,
        centreX: frame.width / 2,
        centreY: y * frame.height,
        ...timing,
      });
    }
  }

  const textfiles: string[] = [];
  const filters = lines.map((line) => {
    const source = FORBIDDEN_IN_COMMAND.test(line.text)
      ? `textfile=${textfilePlaceholder(textfiles.push(line.text) - 1)}`
      : `text=${escapeDrawtextText(line.text)}`;
    const stroke = line.stroke
      ? `:borderw=${Math.max(1, Math.round(line.fontPx * OVERLAY_TEXT_SPEC.condensed.strokeRatio))}:bordercolor=${drawtextColor(line.stroke)}`
      : '';
    const start = line.startMs / 1000;
    const end = (line.startMs + line.durationMs) / 1000;
    return (
      `drawtext=fontfile=${fontPlaceholder}:${source}:fontsize=${px(line.fontPx)}` +
      `:fontcolor=${drawtextColor(line.fill)}${stroke}` +
      `:x=${px(line.centreX)}-text_w/2:y=${px(baselineY(line.centreY, line.fontPx, metrics))}-ascent` +
      `:expansion=none:enable='gte(t,${start.toFixed(3)})*lt(t,${end.toFixed(3)})'`
    );
  });

  const chain = [...(params.prefix ?? []), ...filters];
  return { vf: chain.join(','), textfiles };
}

/** True when the timeline needs the composite pass (pictures or bubble shapes). */
export function needsCompositePass(timeline: RenderTimeline): boolean {
  if (timeline.images.length > 0) return true;
  const overlay = timeline.text_overlay ?? DEFAULT_TEXT_OVERLAY;
  return timeline.texts.some((t) =>
    t.box ? t.box.bg : overlay.mode !== 'outline' && overlay.mode !== 'plain',
  );
}

/** full_command burning the drawtext chain onto the video (input 0), audio copied. */
export function textVideoCommand(params: { vf: string; fps: number }): string {
  return (
    `ffmpeg -y -hide_banner -i {input0} -vf "${params.vf}" ` +
    `-map 0:v -map 0:a? -c:v h264_nvenc -preset p6 -rc vbr -cq 19 -b:v 0 -maxrate 16M -bufsize 32M -profile:v high -pix_fmt yuv420p -r ${params.fps} ` +
    `-c:a copy -movflags +faststart {output}`
  );
}

/**
 * full_command burning the drawtext chain onto a still, out as one PNG
 * frame. Input 0 is the one second quota anchor (Upload-Post bills a still
 * as 60 seconds when the first input has no duration), input 1 the picture.
 */
export function textImageCommand(params: { vf: string }): string {
  return (
    `ffmpeg -y -hide_banner -i {input0} -i {input1} -filter_complex "[1:v]${params.vf}[outv]" ` +
    `-map "[outv]" -frames:v 1 -update 1 {output}`
  );
}
