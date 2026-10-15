// Pure sizing for feature media on a slide. An inset box stores only a width
// (a fraction of the slide); the media keeps its real aspect inside it, and a
// tall phone recording is capped so it never swallows the slide.

import type { LibraryFeature } from '../../../../lib/library-api';

/** A phone screen recording or screenshot (iPhone portrait, about 9:19.5). */
export const PHONE_ASPECT = 9 / 19.5;
/** The no media card's shape: a short portrait card. */
export const EMPTY_ASPECT = 0.8;
/** An inset is never taller than this many times its box width. */
export const INSET_MAX_H = 1.5;

export type Size = { width: number; height: number };

/** The drawn size of media with this aspect (width / height) in an inset box w wide. */
export function insetFrame(w: number, aspect: number, maxH: number = w * INSET_MAX_H): Size {
  const a = aspect > 0 ? aspect : PHONE_ASPECT;
  const height = w / a;
  if (height <= maxH) return { width: w, height };
  return { width: maxH * a, height: maxH };
}

/** The largest size with this aspect that fits a boxW by boxH box. */
export function fitIn(boxW: number, boxH: number, aspect: number): Size {
  const a = aspect > 0 ? aspect : PHONE_ASPECT;
  return boxW / boxH > a ? { width: boxH * a, height: boxH } : { width: boxW, height: boxW / a };
}

/** 7400 ms reads 0:07; null when unknown so nothing fake is shown. */
export function durationLabel(ms: number | null | undefined): string | null {
  if (!ms || ms <= 0) return null;
  const s = Math.max(1, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export type FeatureVisual =
  | { kind: 'clip'; url: string; posterUrl: string | null; durationMs: number | null; aspect: number | null }
  | { kind: 'still'; url: string; aspect: number | null }
  | { kind: 'none' };

/**
 * What a feature shows. Reels lead with the screen recording; slideshows
 * lead with the screenshot and fall back to the recording's frame.
 */
export function featureVisual(feature: Pick<LibraryFeature, 'media' | 'clipUrl' | 'screenshotUrl'> | null | undefined, video: boolean): FeatureVisual {
  if (!feature) return { kind: 'none' };
  const clip = feature.media?.clip ?? null;
  const still = feature.media?.still ?? null;
  if (feature.media === undefined) {
    // Rows that skipped the loaders: only full URLs are drawable.
    const http = (v: string | null) => (v && /^https?:/i.test(v) ? v : null);
    const c = http(feature.clipUrl);
    const s = http(feature.screenshotUrl);
    if (c && (video || !s)) return { kind: 'clip', url: c, posterUrl: null, durationMs: null, aspect: null };
    if (s) return { kind: 'still', url: s, aspect: null };
    return { kind: 'none' };
  }
  if (clip && (video || !still)) return { kind: 'clip', ...clip };
  if (still) return { kind: 'still', ...still };
  return { kind: 'none' };
}

/** The aspect known before any measuring: stored dimensions, else a phone screen. */
export function knownAspect(v: FeatureVisual): number {
  if (v.kind === 'none') return EMPTY_ASPECT;
  return v.aspect ?? PHONE_ASPECT;
}
