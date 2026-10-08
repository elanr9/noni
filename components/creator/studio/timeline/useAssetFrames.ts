// Poster frames for one video asset at k * frameIntervalMs, loaded once per
// uri and shared by every cell cut from it. iOS batches through the native
// module; elsewhere expo-video-thumbnails is one call per frame, so the
// fallback keeps the count small.
import * as VideoThumbnails from 'expo-video-thumbnails';
import { useEffect, useState } from 'react';

import type { MediaAsset } from '../../../../lib/edit-document';
import { isVideoEditorAvailable, thumbnails } from '../../../../modules/video-editor';

export type AssetFrames = { frames: string[]; frameIntervalMs: number };

/** 2x the 56px track height so thumbnails stay crisp on retina. */
export const FRAME_HEIGHT = 112;
const BASE_INTERVAL_MS = 1000;
const MAX_NATIVE_FRAMES = 60;
const MAX_FALLBACK_FRAMES = 16;

const cache = new Map<string, Promise<string[]>>();

export function frameIntervalFor(durationMs: number): number {
  const maxFrames = isVideoEditorAvailable() ? MAX_NATIVE_FRAMES : MAX_FALLBACK_FRAMES;
  const steps = Math.max(1, Math.ceil(durationMs / (BASE_INTERVAL_MS * maxFrames)));
  return steps * BASE_INTERVAL_MS;
}

async function loadFallback(uri: string, timesMs: number[]): Promise<string[]> {
  const out: string[] = [];
  let last = '';
  for (const time of timesMs) {
    try {
      const result = await VideoThumbnails.getThumbnailAsync(uri, { time, quality: 0.5 });
      last = result.uri;
    } catch {
      // keep the previous frame for this slot
    }
    out.push(last);
  }
  return out;
}

function loadFrames(uri: string, durationMs: number): Promise<string[]> {
  const existing = cache.get(uri);
  if (existing) return existing;
  const interval = frameIntervalFor(durationMs);
  const count = Math.max(1, Math.ceil(durationMs / interval));
  const times = Array.from({ length: count }, (_, k) => k * interval);
  const promise = (
    isVideoEditorAvailable() ? thumbnails(uri, times, FRAME_HEIGHT) : loadFallback(uri, times)
  ).catch((): string[] => []);
  cache.set(uri, promise);
  return promise;
}

export function useAssetFrames(asset: MediaAsset | null): AssetFrames {
  const uri = asset?.kind === 'video' ? (asset.localUri ?? '') : '';
  const durationMs = asset?.durationMs ?? 0;
  const frameIntervalMs = frameIntervalFor(durationMs);
  const [loaded, setLoaded] = useState<{ uri: string; frames: string[] }>({ uri: '', frames: [] });

  useEffect(() => {
    if (uri.length === 0 || durationMs <= 0) return;
    let alive = true;
    void loadFrames(uri, durationMs).then((frames) => {
      if (alive) setLoaded({ uri, frames });
    });
    return () => {
      alive = false;
    };
  }, [uri, durationMs]);

  return { frames: loaded.uri === uri ? loaded.frames : [], frameIntervalMs };
}
