import type { BriefSegment } from '../../../lib/briefs-api';
import {
  MAX_BOX_SIZE,
  MIN_BOX_SIZE,
  parseOverlayBoxes,
  serializeOverlayBoxes,
  type OverlayBox,
} from '../../../lib/overlay-boxes';
import { clamp } from './frame';

export function segmentBoxes(segment: BriefSegment): OverlayBox[] {
  return parseOverlayBoxes(segment.overlay_style, {
    text: segment.overlay_text,
    textY: segment.text_y,
  });
}

/** The same segment carrying a new box set, legacy mirror columns included. */
export function segmentWithBoxes(segment: BriefSegment, boxes: OverlayBox[]): BriefSegment {
  const next = serializeOverlayBoxes(boxes);
  return {
    ...segment,
    overlay_style: next.overlay_style,
    overlay_text: next.overlay_text,
    text_y: next.text_y,
    show_on_screen: next.show_on_screen,
  };
}

/** A box id not yet used on this slide (box-N with the next free N). */
export function nextBoxId(boxes: OverlayBox[]): string {
  const used = new Set(boxes.map((b) => b.id));
  let n = boxes.length;
  while (used.has(`box-${n}`)) n += 1;
  return `box-${n}`;
}

export function clampBoxSize(size: number): number {
  return clamp(size, MIN_BOX_SIZE, MAX_BOX_SIZE);
}
