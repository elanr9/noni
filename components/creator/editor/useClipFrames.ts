// Poster frames for one source clip, requested once per uri and shared by
// every piece cut from that clip. Frames sit at k * frameIntervalMs so a
// piece can pick the ones inside its own source range.
import { useEffect, useState } from 'react';

import { thumbnails } from '../../../modules/video-editor';

export type ClipFrames = { frames: string[]; frameIntervalMs: number };

/** 2x the 56px track height so thumbnails stay crisp on retina. */
const FRAME_HEIGHT = 112;
const BASE_INTERVAL_MS = 1000;
const MAX_FRAMES = 60;

const cache = new Map<string, Promise<string[]>>();

export function frameIntervalFor(sourceDurationMs: number): number {
  const steps = Math.max(1, Math.ceil(sourceDurationMs / (BASE_INTERVAL_MS * MAX_FRAMES)));
  return steps * BASE_INTERVAL_MS;
}

function loadFrames(uri: string, sourceDurationMs: number): Promise<string[]> {
  const existing = cache.get(uri);
  if (existing) return existing;
  const interval = frameIntervalFor(sourceDurationMs);
  const count = Math.max(1, Math.ceil(sourceDurationMs / interval));
  const times = Array.from({ length: count }, (_, k) => k * interval);
  const promise = thumbnails(uri, times, FRAME_HEIGHT).catch((): string[] => []);
  cache.set(uri, promise);
  return promise;
}

export function useClipFrames(sourceUri: string, sourceDurationMs: number): ClipFrames {
  const frameIntervalMs = frameIntervalFor(sourceDurationMs);
  const [loaded, setLoaded] = useState<{ uri: string; frames: string[] }>({
    uri: '',
    frames: [],
  });

  useEffect(() => {
    let alive = true;
    if (sourceUri.length === 0 || sourceDurationMs <= 0) return;
    void loadFrames(sourceUri, sourceDurationMs).then((list) => {
      if (alive) setLoaded({ uri: sourceUri, frames: list });
    });
    return () => {
      alive = false;
    };
  }, [sourceUri, sourceDurationMs]);

  return { frames: loaded.uri === sourceUri ? loaded.frames : [], frameIntervalMs };
}
