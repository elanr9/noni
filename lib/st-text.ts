/**
 * On-screen text (StText) drawn in React Native. Sizes are px at a 300 wide
 * frame; `scale` is frameWidth / 300. It follows the same TikTok text spec as
 * the brief canvas and the render (OVERLAY_TEXT_SPEC): TikTok Sans 600, a
 * stroke of 6% of the size outside the letter, and colored text as a tinted
 * bubble with deep same hue letters.
 */
import type { TextStyle } from 'react-native';

import type { StText, StTextStyle } from './brief-library';
import { OVERLAY_TEXT_SPEC, overlayBoxFill, overlayTextContrast } from './overlay-boxes';

export const ST_FONTS: readonly string[] = ['System', 'Georgia', 'Arial Black', 'Courier New', 'Trebuchet MS'];

const DARK = '#0B0B0C';

function isDark(c: string): boolean {
  return c.toUpperCase() === DARK || c.toUpperCase() === '#000000' || c.toUpperCase() === '#000';
}

export type StRender = { text: TextStyle; box: { backgroundColor?: string; paddingHorizontal?: number; paddingVertical?: number; borderRadius?: number }; strokeColor: string | null; strokeWidth: number };

/** Text and box styles for one on-screen text at a frame scale. */
export function stRender(x: Pick<StText, 'size' | 'color' | 'style' | 'align' | 'font'>, scale: number): StRender {
  const size = x.size * scale;
  const style: StTextStyle = x.style;
  const boxed = style === 'bg' || style === 'inv-bg';
  const spec = boxed ? OVERLAY_TEXT_SPEC.bubble : OVERLAY_TEXT_SPEC.condensed;
  const base: { -readonly [K in keyof TextStyle]: TextStyle[K] } = { color: x.color, fontSize: size, lineHeight: Math.round(size * spec.lineHeight), fontFamily: spec.fontFamily, fontWeight: spec.fontWeight, textAlign: x.align };
  if (x.font === 1) base.fontFamily = 'Georgia';
  if (x.font === 3) base.fontFamily = 'Courier New';
  const box: StRender['box'] = {};
  let strokeColor: string | null = null;
  /* StTextView offsets its stroke copies by half of this. */
  const strokeWidth = size * OVERLAY_TEXT_SPEC.condensed.strokeRatio * 2;
  const pad = { paddingVertical: size * OVERLAY_TEXT_SPEC.bubble.padY, paddingHorizontal: size * OVERLAY_TEXT_SPEC.bubble.padX, borderRadius: size * OVERLAY_TEXT_SPEC.bubble.radius };
  if (style === 'none') {
    base.textShadowColor = 'rgba(0,0,0,0.6)';
    base.textShadowOffset = { width: 0, height: 1 };
    base.textShadowRadius = 2;
  }
  if (style === 'outline') strokeColor = isDark(x.color) ? '#FFFFFF' : DARK;
  if (style === 'inv-outline') {
    base.color = isDark(x.color) ? '#FFFFFF' : DARK;
    strokeColor = x.color;
  }
  if (style === 'bg') {
    box.backgroundColor = isDark(x.color) ? '#FFFFFF' : DARK;
    base.color = x.color;
    Object.assign(box, pad);
  }
  if (style === 'inv-bg') {
    box.backgroundColor = overlayBoxFill(x.color);
    base.color = overlayTextContrast(x.color);
    Object.assign(box, pad);
  }
  return { text: base, box, strokeColor, strokeWidth };
}
