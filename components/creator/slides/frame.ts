// The published slide is exactly 1080x1920. Every stage draws that frame
// scaled to fit, so a fraction placed here lands on the same pixel in the
// server bake (renderTimeline.ts / assemble.ts renderSlideWithFfmpeg).
export const FRAME_WIDTH = 1080;
export const FRAME_HEIGHT = 1920;
export const FRAME_ASPECT = FRAME_WIDTH / FRAME_HEIGHT;

/** Items keep their centre this far from the frame edge, as a fraction. */
export const PLACE_EDGE = 0.06;
/** Snap to the horizontal centre within this fraction. */
export const CENTER_SNAP = 0.025;

/** Rough TikTok chrome, as fractions of the frame. Guides only. */
export const TIKTOK_CHROME = {
  /** Action column (avatar, like, comment, save, share). */
  actionColumn: { xCenter: 0.915, top: 0.6, bottom: 0.885, diameter: 0.085 },
  /** Handle, caption and sound line above the tab bar. */
  captionArea: { left: 0.04, right: 0.2, top: 0.79, bottom: 0.905 },
  /** Status bar and the top tabs. */
  topBand: { bottom: 0.075 },
  /** Tab bar and home indicator. */
  bottomBand: { top: 0.93 },
} as const;

export function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export function fitFrame(availableWidth: number, availableHeight: number): {
  width: number;
  height: number;
} {
  if (availableWidth <= 0 || availableHeight <= 0) return { width: 0, height: 0 };
  const byHeight = availableHeight * FRAME_ASPECT;
  if (byHeight <= availableWidth) {
    return { width: byHeight, height: availableHeight };
  }
  return { width: availableWidth, height: availableWidth / FRAME_ASPECT };
}
