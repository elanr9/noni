// Camera roll photos are often 4000px wide; decoding several of them while
// paging stutters. Each picked photo gets a 1080px JPEG preview for the
// stage (the frame is 1080 wide, so nothing is lost on screen). The
// original uri is what gets uploaded. Previews are cached for the session.
import { useEffect, useState } from 'react';
import { Image } from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';

import type { PickedPhoto } from '../../../lib/submissions';

const PREVIEW_WIDTH = 1080;
/** Photos narrower than this are used as they are. */
const SKIP_BELOW_WIDTH = 1400;

const previews = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();

function sourceWidth(uri: string): Promise<number> {
  return new Promise((resolve) => {
    Image.getSize(
      uri,
      (w) => resolve(w),
      () => resolve(0),
    );
  });
}

async function buildPreview(uri: string): Promise<string> {
  const width = await sourceWidth(uri);
  if (width > 0 && width < SKIP_BELOW_WIDTH) return uri;
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: PREVIEW_WIDTH } }],
    { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG },
  );
  return result.uri;
}

export function ensurePreview(uri: string): Promise<string> {
  const cached = previews.get(uri);
  if (cached !== undefined) return Promise.resolve(cached);
  const pending = inflight.get(uri);
  if (pending) return pending;
  const job = buildPreview(uri)
    .catch(() => uri)
    .then((preview) => {
      previews.set(uri, preview);
      inflight.delete(uri);
      return preview;
    });
  inflight.set(uri, job);
  return job;
}

/**
 * Stage friendly uri per slot. The original shows the instant a photo is
 * picked, then swaps to the downscaled preview once it is ready.
 */
export function usePhotoPreviews(
  photos: Record<number, PickedPhoto>,
): Record<number, string> {
  const [ready, setReady] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    for (const photo of Object.values(photos)) {
      if (previews.has(photo.uri)) continue;
      void ensurePreview(photo.uri).then((preview) => {
        if (!cancelled) setReady((prev) => ({ ...prev, [photo.uri]: preview }));
      });
    }
    return () => {
      cancelled = true;
    };
  }, [photos]);

  const out: Record<number, string> = {};
  for (const [slot, photo] of Object.entries(photos)) {
    out[Number(slot)] = previews.get(photo.uri) ?? ready[photo.uri] ?? photo.uri;
  }
  return out;
}
