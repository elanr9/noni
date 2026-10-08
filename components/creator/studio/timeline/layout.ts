import { blockRanges, type BlockRange, type VideoDocument } from '../../../../lib/edit-document';
import { msToPx } from './scale';

export const TRACK_H = 56;
export const LANE_GAP = 2;
export const RULER_H = 18;
export const RULER_GAP = 6;
export const BLOCK_RADIUS = 8;
export const HANDLE_W = 18;

export type BlockItem = { range: BlockRange; x: number; width: number };

/** Blocks laid out end to end with no gaps, so time is linear in x. */
export function stripItems(doc: VideoDocument, msPerPx: number): BlockItem[] {
  return blockRanges(doc).map((range) => ({
    range,
    x: msToPx(range.startMs, msPerPx),
    width: msToPx(range.endMs - range.startMs, msPerPx),
  }));
}

export function laneHeight(cellCount: number): number {
  return cellCount > 1 ? (TRACK_H - LANE_GAP) / 2 : TRACK_H;
}
