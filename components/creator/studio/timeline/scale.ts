// Time scale shared by every lane on the timeline. The clip strip owns it;
// the overlay lane reads it so bars line up with blocks. Inside the scrolled
// content, time 0 is at x 0, so x = ms / msPerPx. scrollOffsetMs is the
// time at the left edge of the visible strip for lanes drawn outside it.
import { create } from 'zustand';

export const DEFAULT_PX_PER_SEC = 56;
export const MIN_PX_PER_SEC = 24;
export const MAX_PX_PER_SEC = 320;

export const DEFAULT_MS_PER_PX = 1000 / DEFAULT_PX_PER_SEC;
export const MIN_MS_PER_PX = 1000 / MAX_PX_PER_SEC;
export const MAX_MS_PER_PX = 1000 / MIN_PX_PER_SEC;

type TimelineScaleState = {
  msPerPx: number;
  scrollOffsetMs: number;
  setMsPerPx(msPerPx: number): void;
  setScrollOffsetMs(scrollOffsetMs: number): void;
};

export const useTimelineScale = create<TimelineScaleState>((set) => ({
  msPerPx: DEFAULT_MS_PER_PX,
  scrollOffsetMs: 0,
  setMsPerPx(msPerPx) {
    set({ msPerPx: Math.max(MIN_MS_PER_PX, Math.min(MAX_MS_PER_PX, msPerPx)) });
  },
  setScrollOffsetMs(scrollOffsetMs) {
    set({ scrollOffsetMs });
  },
}));

export function msToPx(ms: number, msPerPx: number): number {
  return ms / msPerPx;
}

export function pxToMs(px: number, msPerPx: number): number {
  return px * msPerPx;
}
