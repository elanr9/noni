import { useEffect, useState } from 'react';
import * as VideoThumbnails from 'expo-video-thumbnails';

import { latestSubmissionsByAssignment, signedVideoUrl } from '../../../lib/admin-api';

/** Thumbnails are expensive to extract; keep them for the session. */
const cache = new Map<string, string>();
const assignmentMediaCache = new Map<string, string | null>();

/** Latest submission's first media path for one assignment, for surfaces that only hold the id. */
export function useAssignmentMediaPath(assignmentId: string | null): string | null {
  const [path, setPath] = useState<string | null>(
    assignmentId !== null ? (assignmentMediaCache.get(assignmentId) ?? null) : null,
  );

  useEffect(() => {
    if (assignmentId === null) {
      setPath(null);
      return;
    }
    if (assignmentMediaCache.has(assignmentId)) {
      setPath(assignmentMediaCache.get(assignmentId) ?? null);
      return;
    }
    let cancelled = false;
    void latestSubmissionsByAssignment([assignmentId])
      .then((subs) => {
        const found = subs.get(assignmentId)?.video_path ?? null;
        assignmentMediaCache.set(assignmentId, found);
        if (!cancelled) setPath(found);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [assignmentId]);

  return path;
}

/**
 * Thumbnail for a submission's first media path (submissions.video_path):
 * the Reel's first frame, or slide 1 itself for a Slideshow. Null while
 * resolving or when there is no submission yet.
 */
export function usePostThumb(
  mediaPath: string | null,
  format: 'video' | 'photo_carousel',
): string | null {
  const key = mediaPath !== null ? `${format}:${mediaPath}` : null;
  const [thumb, setThumb] = useState<string | null>(
    key !== null ? (cache.get(key) ?? null) : null,
  );

  useEffect(() => {
    if (key === null || mediaPath === null) {
      setThumb(null);
      return;
    }
    const cached = cache.get(key);
    if (cached !== undefined) {
      setThumb(cached);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const url = await signedVideoUrl(mediaPath);
        const uri =
          format === 'video'
            ? (await VideoThumbnails.getThumbnailAsync(url, { time: 0 })).uri
            : url;
        cache.set(key, uri);
        if (!cancelled) setThumb(uri);
      } catch {
        // Gradient fallback renders instead.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key, mediaPath, format]);

  return thumb;
}

/** First frame of a submitted Reel, per the §1 media rule. */
export function useVideoThumb(videoPath: string | null): string | null {
  return usePostThumb(videoPath, 'video');
}
