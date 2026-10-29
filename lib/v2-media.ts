/**
 * Thumbnails for v2 post rows: a signed URL for the submission media, with a
 * first-frame poster pulled once per video. Cached for the session.
 */
import { useEffect, useState } from 'react';

import { posterForVideo } from '../components/ui/MediaThumb';
import { supabase } from './supabase';
import type { V2Post } from './v2-posts';

const frames = new Map<string, Promise<string | null>>();

function isVideo(path: string, format: V2Post['mediaFormat']): boolean {
  return format === 'video' || /\.(mp4|mov|m4v|webm)$/i.test(path);
}

export function postFrame(p: Pick<V2Post, 'mediaPath' | 'mediaFormat'>): Promise<string | null> {
  const path = p.mediaPath;
  if (!path) return Promise.resolve(null);
  const hit = frames.get(path);
  if (hit) return hit;
  const job = (async () => {
    if (/^https?:/.test(path)) return isVideo(path, p.mediaFormat) ? posterForVideo(path) : path;
    const { data, error } = await supabase.storage.from('videos').createSignedUrl(path, 3600);
    if (error || !data) return null;
    return isVideo(path, p.mediaFormat) ? posterForVideo(data.signedUrl) : data.signedUrl;
  })().catch(() => null);
  frames.set(path, job);
  return job;
}

/** The post's frame once it resolves; null while loading or when there is no media. */
export function usePostFrame(p: Pick<V2Post, 'mediaPath' | 'mediaFormat'>): string | null {
  const [uri, setUri] = useState<string | null>(null);
  const path = p.mediaPath;
  const format = p.mediaFormat;
  useEffect(() => {
    let live = true;
    void postFrame({ mediaPath: path, mediaFormat: format }).then((u) => {
      if (live) setUri(u);
    });
    return () => {
      live = false;
    };
  }, [path, format]);
  return uri;
}
