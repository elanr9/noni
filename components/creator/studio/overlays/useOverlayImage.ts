// Resolves a picture asset to something <Image> can show. Local files win;
// uploaded studio assets (asset-*.ext) sign from the videos bucket and brand
// library picks sign from brief-assets. Signed URLs are cached per path.
import { useEffect, useState } from 'react';
import { Image } from 'react-native';

import type { MediaAsset } from '../../../../lib/edit-document';
import { signedMediaUrl } from '../../../../lib/media-library-api';
import { supabase } from '../../../../lib/supabase';

const STUDIO_ASSET_FILE = /\/asset-[^/]+$/;
const SIGNED_TTL_S = 3600;

const urlCache = new Map<string, Promise<string>>();

function signStoragePath(path: string): Promise<string> {
  const cached = urlCache.get(path);
  if (cached) return cached;
  const pending = STUDIO_ASSET_FILE.test(path)
    ? supabase.storage
        .from('videos')
        .createSignedUrl(path, SIGNED_TTL_S)
        .then(({ data, error }) => {
          if (error) throw error;
          return data.signedUrl;
        })
    : signedMediaUrl(path);
  pending.catch(() => urlCache.delete(path));
  urlCache.set(path, pending);
  return pending;
}

export type OverlayImageSource = { uri: string | null; aspect: number };

export function useOverlayImage(asset: MediaAsset | null): OverlayImageSource {
  const localUri = asset?.localUri ?? null;
  const storagePath = asset?.storagePath ?? null;
  const knownAspect =
    asset && asset.width && asset.height && asset.width > 0 && asset.height > 0
      ? asset.width / asset.height
      : null;
  const [signed, setSigned] = useState<{ path: string; url: string } | null>(null);
  const [measured, setMeasured] = useState<number | null>(null);
  const uri = localUri ?? (storagePath && signed?.path === storagePath ? signed.url : null);

  useEffect(() => {
    if (localUri || !storagePath) return;
    let cancelled = false;
    signStoragePath(storagePath)
      .then((url) => {
        if (!cancelled) setSigned({ path: storagePath, url });
      })
      .catch((e: unknown) => console.warn('overlay image sign failed', e));
    return () => {
      cancelled = true;
    };
  }, [localUri, storagePath]);

  useEffect(() => {
    if (knownAspect !== null || !uri) return;
    let cancelled = false;
    Image.getSize(
      uri,
      (w, h) => {
        if (!cancelled && w > 0 && h > 0) setMeasured(w / h);
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [uri, knownAspect]);

  return { uri, aspect: knownAspect ?? measured ?? 1 };
}
