/**
 * On-screen text (StText) drawn in React Native. Sizes are px at a 300 wide
 * frame; `scale` is frameWidth / 300. TikTok classic: 700, black stroke at
 * 22% of the size, drawn here as a four-way text shadow.
 */
import type { TextStyle } from 'react-native';

import type { StText, StTextStyle } from './brief-library';

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
  const base: { -readonly [K in keyof TextStyle]: TextStyle[K] } = { color: x.color, fontSize: size, lineHeight: Math.round(size * 1.2), fontWeight: '700', textAlign: x.align, letterSpacing: -0.2 * scale };
  if (x.font === 1) base.fontFamily = 'Georgia';
  if (x.font === 3) base.fontFamily = 'Courier New';
  const box: StRender['box'] = {};
  let strokeColor: string | null = null;
  const strokeWidth = size * 0.22;
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
    box.paddingVertical = 4 * scale;
    box.paddingHorizontal = 10 * scale;
    box.borderRadius = 6 * scale;
  }
  if (style === 'inv-bg') {
    box.backgroundColor = x.color;
    base.color = x.color.toUpperCase() === '#FFFFFF' || x.color.toUpperCase() === '#FFD60A' ? DARK : '#FFFFFF';
    box.paddingVertical = 4 * scale;
    box.paddingHorizontal = 10 * scale;
    box.borderRadius = 6 * scale;
  }
  return { text: base, box, strokeColor, strokeWidth };
}
