// The window of a source photo that fills a slide, as fractions of the
// source (x, y, width, height in 0..1). The stage shows the source scaled so
// this window exactly covers the frame; submit cuts the same window out of
// the original, so what the creator framed is what posts.
import { clamp } from './frame';

export type PhotoCrop = { x: number; y: number; width: number; height: number };

export type SourceSize = { width: number; height: number };

const MAX_ZOOM = 5;

/** Widest window (zoom 1) that still has the frame's aspect. */
function coverWindow(source: SourceSize, frameAspect: number): { width: number; height: number } {
  const sourceAspect = source.width / source.height;
  if (sourceAspect >= frameAspect) {
    return { width: frameAspect / sourceAspect, height: 1 };
  }
  return { width: 1, height: sourceAspect / frameAspect };
}

/** Window centred on the source at zoom 1. */
export function centeredCrop(source: SourceSize, frameAspect: number): PhotoCrop {
  const size = coverWindow(source, frameAspect);
  return { x: (1 - size.width) / 2, y: (1 - size.height) / 2, ...size };
}

function clampCrop(crop: PhotoCrop): PhotoCrop {
  return {
    ...crop,
    x: clamp(crop.x, 0, 1 - crop.width),
    y: clamp(crop.y, 0, 1 - crop.height),
  };
}

/** Same centre and zoom, refit to another frame aspect. */
export function refitCrop(
  crop: PhotoCrop,
  source: SourceSize,
  frameAspect: number,
): PhotoCrop {
  const cover = coverWindow(source, frameAspect);
  const zoom = clamp(
    Math.min(cover.width / crop.width, cover.height / crop.height),
    1,
    MAX_ZOOM,
  );
  const width = cover.width / zoom;
  const height = cover.height / zoom;
  return clampCrop({
    x: crop.x + crop.width / 2 - width / 2,
    y: crop.y + crop.height / 2 - height / 2,
    width,
    height,
  });
}

/** Slide the window by a finger move of (dx, dy) frame fractions. */
export function panCrop(crop: PhotoCrop, dx: number, dy: number): PhotoCrop {
  return clampCrop({ ...crop, x: crop.x - dx * crop.width, y: crop.y - dy * crop.height });
}

/**
 * Zoom by `ratio` about a focal point given as frame fractions, so the photo
 * pixel under the fingers stays under the fingers. Never zooms out past the
 * cover window or in past MAX_ZOOM.
 */
export function zoomCrop(
  crop: PhotoCrop,
  source: SourceSize,
  frameAspect: number,
  ratio: number,
  focal: { x: number; y: number },
): PhotoCrop {
  const cover = coverWindow(source, frameAspect);
  const zoom = clamp((cover.width / crop.width) * ratio, 1, MAX_ZOOM);
  const width = cover.width / zoom;
  const height = cover.height / zoom;
  return clampCrop({
    x: crop.x + focal.x * crop.width - focal.x * width,
    y: crop.y + focal.y * crop.height - focal.y * height,
    width,
    height,
  });
}

/** Pixel rect of the window in the original, for the final cut. */
export function cropPixels(
  crop: PhotoCrop,
  source: SourceSize,
): { originX: number; originY: number; width: number; height: number } {
  const width = Math.max(1, Math.floor(crop.width * source.width));
  const height = Math.max(1, Math.floor(crop.height * source.height));
  return {
    originX: clamp(Math.round(crop.x * source.width), 0, source.width - width),
    originY: clamp(Math.round(crop.y * source.height), 0, source.height - height),
    width,
    height,
  };
}

/** Where the whole source lands inside a stage so `crop` fills it. */
export function photoLayout(
  crop: PhotoCrop,
  stageWidth: number,
  stageHeight: number,
): { left: number; top: number; width: number; height: number } {
  const width = stageWidth / crop.width;
  const height = stageHeight / crop.height;
  return { left: -crop.x * width, top: -crop.y * height, width, height };
}
