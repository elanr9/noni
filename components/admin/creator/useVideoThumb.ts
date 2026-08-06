import { useEffect, useState } from 'react';
import * as VideoThumbnails from 'expo-video-thumbnails';

import { signedVideoUrl } from '../../../lib/admin-api';

/** Thumbnails are expensive to extract; keep them for the session. */
const cache = new Map<string, string>();

/** First frame of a submitted Reel, per the §1 media rule. Null while resolving or when there is no recording. */
export function useVideoThumb(videoPath: string | null): string | null {
  const [thumb, setThumb] = useState<string | null>(
    videoPath !== null ? (cache.get(videoPath) ?? null) : null,
  );

  useEffect(() => {
    if (videoPath === null) {
      setThumb(null);
      return;
    }
    const cached = cache.get(videoPath);
    if (cached !== undefined) {
      setThumb(cached);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const url = await signedVideoUrl(videoPath);
        const result = await VideoThumbnails.getThumbnailAsync(url, { time: 0 });
        cache.set(videoPath, result.uri);
        if (!cancelled) setThumb(result.uri);
      } catch {
        // Gradient fallback renders instead.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [videoPath]);

  return thumb;
}
