// Placement maths shared by the stage items. Every function is a worklet so
// the gesture callbacks can call it on the UI thread.
import { CENTER_SNAP, PLACE_EDGE } from '../../slides/frame';

/** Server clamp for a picture pop-up width (same as the legacy inset). */
export const MIN_IMAGE_WIDTH = 0.15;
export const MAX_IMAGE_WIDTH = 0.95;
/** Corner radius as a fraction of the frame width (12px on the 390pt design stage). */
export const IMAGE_CORNER_RADIUS = 12 / 390;
/** Pinches ending within this ratio of the original size snap back to it. */
const PINCH_SNAP = 0.03;

export function clampValue(n: number, lo: number, hi: number): number {
  'worklet';
  return Math.max(lo, Math.min(hi, n));
}

export function clampCenter(x: number, y: number): { x: number; y: number } {
  'worklet';
  return {
    x: clampValue(x, PLACE_EDGE, 1 - PLACE_EDGE),
    y: clampValue(y, PLACE_EDGE, 1 - PLACE_EDGE),
  };
}

export function snapCenterX(x: number): number {
  'worklet';
  return Math.abs(x - 0.5) < CENTER_SNAP ? 0.5 : x;
}

export function snapRatio(ratio: number): number {
  'worklet';
  return Math.abs(ratio - 1) < PINCH_SNAP ? 1 : ratio;
}
