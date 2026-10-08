import type { BlockLayout } from '../../../../lib/edit-document';

export type CellRect = { x: number; y: number; width: number; height: number };

/** Where cell `index` of a block sits inside a frame of the given size.
 * Mirrors cellRect in CompositionBuilder.swift. */
export function cellRect(layout: BlockLayout, index: number, width: number, height: number): CellRect {
  if (layout === 'split_v') {
    return { x: 0, y: index === 0 ? 0 : height / 2, width, height: height / 2 };
  }
  if (layout === 'split_h') {
    return { x: index === 0 ? 0 : width / 2, y: 0, width: width / 2, height };
  }
  return { x: 0, y: 0, width, height };
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
