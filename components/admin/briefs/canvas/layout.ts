// Slide geometry from reference_ui/briefs/SSShared.jsx (layoutOf) and
// SSCanvas.jsx (BLOCKED, TT_SS, IG_BAR, text styles). Every value is a
// fraction of a 9:16 frame so the same numbers draw a 30pt thumb and a
// full screen canvas.

import type { BriefSlide, SlideBox, SlideTextStyle } from '../../../../lib/briefs-api';
import { briefTone, color } from '../../../../theme/tokens';
import { insetFrame } from '../media/geometry';

export const SLIDE_RATIO = 16 / 9;

export type Platform = 'tiktok' | 'instagram';
export type Ghost = Platform | 'off';

/** Instagram shows a 4:5 crop of the 9:16 frame: black bands top and bottom. */
export const IG_BAR = (1 - 5 / 4 / (16 / 9)) / 2;
/** TikTok shows slideshows letterboxed: tabs band on top, dots, caption and tab bar below. */
export const TT_SS = { top: 0.09, bottom: 0.22 } as const;

export type Zone = { id: string; x: number; y: number; w: number; h: number };

export const BLOCKED: Record<'tiktok' | 'tiktokSlideshow' | 'instagram', Zone[]> = {
  tiktok: [
    { id: 'rail', x: 0.84, y: 0.42, w: 0.16, h: 0.46 },
    { id: 'caption', x: 0, y: 0.7, w: 0.8, h: 0.3 },
  ],
  tiktokSlideshow: [
    { id: 'nav', x: 0, y: 0, w: 1, h: TT_SS.top },
    { id: 'caption', x: 0, y: 1 - TT_SS.bottom, w: 1, h: TT_SS.bottom },
    { id: 'rail', x: 0.84, y: 0.4, w: 0.16, h: 0.36 },
  ],
  instagram: [
    { id: 'top', x: 0, y: 0, w: 1, h: IG_BAR },
    { id: 'bottom', x: 0, y: 1 - IG_BAR, w: 1, h: IG_BAR },
    { id: 'counter', x: 0.8, y: IG_BAR + 0.02, w: 0.17, h: 0.05 },
  ],
};

export function blockedFor(ghost: Ghost, reel: boolean): Zone[] {
  if (ghost === 'off') return [];
  if (ghost === 'tiktok') return reel ? BLOCKED.tiktok : BLOCKED.tiktokSlideshow;
  return BLOCKED.instagram;
}

export function overlaps(a: Zone, b: Zone): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function clamp(v: number, a: number, b: number): number {
  return Math.min(b, Math.max(a, v));
}

type LayoutInput = Pick<BriefSlide, 'box' | 'inset_box' | 'box_ig' | 'inset_box_ig'> & {
  inset_feature_id?: string | null;
  text?: string;
};

/**
 * Default spots, as frame fractions. Text starts in the upper third: TikTok
 * at y 0.30, Instagram at the same height inside its 4:5 crop (the crop runs
 * from IG_BAR to 1 minus IG_BAR, so 0.30 of it is y 0.36). With an inset the
 * text goes above it and the media sits below, clear of the caption. Only
 * unset boxes use these; a box the manager moved keeps its spot.
 */
export const DEFAULT_BOXES = {
  tiktok: {
    text: { x: 0.5, y: 0.3, w: 0.66 },
    textWithInset: { x: 0.5, y: 0.22, w: 0.66 },
    inset: { x: 0.5, y: 0.52, w: 0.42 },
  },
  instagram: {
    text: { x: 0.5, y: 0.36, w: 0.66 },
    textWithInset: { x: 0.5, y: 0.3, w: 0.66 },
    inset: { x: 0.5, y: 0.6, w: 0.42 },
  },
} as const;

/** Where the text box and the inset sit, per platform, with the defaults above. */
export function layoutOf(s: LayoutInput, platform: Platform = 'tiktok'): { text: SlideBox; inset: SlideBox } {
  const hasInset = Boolean(s.inset_feature_id);
  if (platform === 'instagram') {
    const d = DEFAULT_BOXES.instagram;
    const inset =
      s.inset_box_ig ??
      (s.inset_box ? { ...s.inset_box, y: clamp(s.inset_box.y, 0.26, 0.74) } : { ...d.inset });
    const text =
      s.box_ig ??
      (s.box ? { ...s.box, y: clamp(s.box.y, 0.22, 0.78) } : hasInset ? { ...d.textWithInset } : { ...d.text });
    return { text, inset };
  }
  const d = DEFAULT_BOXES.tiktok;
  const inset = s.inset_box ?? { ...d.inset };
  const text = s.box ?? (hasInset ? { ...d.textWithInset } : { ...d.text });
  return { text, inset };
}

/**
 * Layout stored on a generated CTA slide: the plug line on top, the feature's
 * media under it. Kept left of TikTok's like rail and above the caption; on
 * Instagram inside the 4:5 crop.
 */
export const CTA_BOXES = {
  box: { x: 0.44, y: 0.22, w: 0.66 },
  inset_box: { x: 0.44, y: 0.52, w: 0.42 },
  box_ig: { x: 0.5, y: 0.3, w: 0.72 },
  inset_box_ig: { x: 0.5, y: 0.6, w: 0.42 },
} as const;

/** Long text post type: small left aligned text, no background, wide box. */
export const LONGTEXT_TSTYLE: SlideTextStyle = { size: 0.62, align: 'left', bg: 'none' };
export const LONGTEXT_BOX: SlideBox = { x: 0.5, y: 0.34, w: 0.86 };

// Text styling: TikTok's text tool, one font, letter color plus box color.
export const SWATCHES: readonly string[] = briefTone.textSwatches;

export type TextBg = 'outline' | 'box' | 'none';
export type ResolvedTextStyle = {
  /** Letter color. */
  color: string;
  /** Box fill when bg is box. */
  boxColor: string;
  bg: TextBg;
  align: 'left' | 'center' | 'right';
  size: number;
};

export const DEFAULT_TSTYLE: ResolvedTextStyle = {
  color: color.white,
  boxColor: color.white,
  bg: 'outline',
  align: 'center',
  size: 1,
};

export function resolveTextStyle(tstyle: SlideTextStyle | undefined): ResolvedTextStyle {
  const bg: TextBg = tstyle?.bg === 'box' || tstyle?.bg === 'soft' ? 'box' : tstyle?.bg === 'none' ? 'none' : 'outline';
  return {
    color: tstyle?.color ?? DEFAULT_TSTYLE.color,
    boxColor: tstyle?.bgColor ?? DEFAULT_TSTYLE.boxColor,
    bg,
    align: tstyle?.align ?? DEFAULT_TSTYLE.align,
    size: tstyle?.size ?? DEFAULT_TSTYLE.size,
  };
}

/** The stored shape for a resolved style; drops nothing the creator side reads. */
export function serializeTextStyle(ts: ResolvedTextStyle): SlideTextStyle {
  return { color: ts.color, bgColor: ts.boxColor, bg: ts.bg, align: ts.align, size: ts.size };
}

/** Luma over 150 reads as a light color (SSCanvas light()). */
export function isLight(hex: string): boolean {
  const n = parseInt(hex.slice(1), 16);
  const r = n >> 16;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (r * 299 + g * 587 + b * 114) / 1000 > 150;
}

/** Text size in px for a slide drawn w px wide (SSShared fs = w * 0.072). */
export function fontSizeFor(w: number, size: number): number {
  return Math.max(8, Math.round(w * 0.072 * size));
}

export type Rect = Zone;

/** Rough text box rectangle for overlap checks (SSCanvas rectOf). */
export function textRect(text: string, box: SlideBox, ts: ResolvedTextStyle, W: number, H: number): Rect {
  const fs = fontSizeFor(W, ts.size);
  const perLine = Math.max(6, (box.w * W) / (fs * 0.52));
  const lines = Math.max(1, Math.ceil((text || ' ').length / perLine));
  const pad = ts.bg === 'none' || ts.bg === 'outline' ? 0 : fs * 0.7;
  const th = (lines * fs * 1.2 + pad) / H;
  return { id: 'text', x: box.x - box.w / 2, y: box.y - th / 2, w: box.w, h: th };
}

/** The inset's footprint; with the media's aspect it matches what Shot draws (tall recordings capped). */
export function insetRect(box: SlideBox, W: number, H: number, aspect?: number): Rect {
  if (aspect === undefined) {
    const ih = (box.w * W * 0.62) / H;
    return { id: 'inset', x: box.x - box.w / 2, y: box.y - ih / 2, w: box.w, h: ih };
  }
  const f = insetFrame(box.w * W, aspect);
  const iw = f.width / W;
  const ih = f.height / H;
  return { id: 'inset', x: box.x - iw / 2, y: box.y - ih / 2, w: iw, h: ih };
}

export function zoneName(zone: Zone | undefined, ghost: Ghost): string | null {
  if (!zone) return null;
  if (ghost === 'instagram') return zone.id === 'counter' ? 'Behind the slide counter' : 'Cropped off on Instagram';
  const names: Record<string, string> = {
    nav: 'Behind the top tabs',
    rail: 'Behind the like and share buttons',
    caption: 'Behind the caption',
    tabs: 'Behind the tab bar',
  };
  return names[zone.id] ?? null;
}

/** The dark canvas surface. */
export const CANVAS_BG = briefTone.canvas.bg;
