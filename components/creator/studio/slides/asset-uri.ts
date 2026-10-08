import { useEffect, useState } from 'react';
import { Image } from 'react-native';

import type { MediaAsset } from '../../../../lib/edit-document';
import { supabase } from '../../../../lib/supabase';
import type { SourceSize } from '../../slides/photo-crop';
import { ensurePreview } from '../../slides/photo-previews';

const SIGNED_TTL_S = 3600;
/** Re-sign a little before the URL expires. */
const SIGNED_REUSE_MS = (SIGNED_TTL_S - 300) * 1000;

const signed = new Map<string, { at: number; url: Promise<string | null> }>();

function signedUrl(path: string): Promise<string | null> {
  const cached = signed.get(path);
  if (cached && Date.now() - cached.at < SIGNED_REUSE_MS) return cached.url;
  const url = supabase.storage
    .from('videos')
    .createSignedUrl(path, SIGNED_TTL_S)
    .then(({ data }) => data?.signedUrl ?? null)
    .catch(() => null);
  signed.set(path, { at: Date.now(), url });
  return url;
}

/** Display uri for an asset: the local file (downscaled once ready) or a signed bucket URL. */
export function useAssetUri(asset: MediaAsset | null): string | null {
  const localUri = asset?.localUri ?? null;
  const storagePath = asset?.storagePath ?? null;
  const [resolved, setResolved] = useState<{ key: string; uri: string | null } | null>(null);
  const key = `${localUri ?? ''}|${storagePath ?? ''}`;

  useEffect(() => {
    let cancelled = false;
    if (localUri !== null) {
      void ensurePreview(localUri).then((preview) => {
        if (!cancelled) setResolved({ key, uri: preview });
      });
    } else if (storagePath !== null) {
      void signedUrl(storagePath).then((url) => {
        if (!cancelled) setResolved({ key, uri: url });
      });
    }
    return () => {
      cancelled = true;
    };
  }, [key, localUri, storagePath]);

  if (resolved !== null && resolved.key === key) return resolved.uri;
  return localUri;
}

export function assetSource(asset: MediaAsset | null): SourceSize | null {
  if (!asset || asset.width === null || asset.height === null) return null;
  if (asset.width <= 0 || asset.height <= 0) return null;
  return { width: asset.width, height: asset.height };
}

/** Source pixel size, read from the file when the asset never recorded it. */
export function useAssetSource(asset: MediaAsset | null, uri: string | null): SourceSize | null {
  const known = assetSource(asset);
  const [read, setRead] = useState<{ uri: string; size: SourceSize } | null>(null);

  useEffect(() => {
    if (known !== null || uri === null) return;
    let cancelled = false;
    Image.getSize(
      uri,
      (width, height) => {
        if (!cancelled && width > 0 && height > 0) setRead({ uri, size: { width, height } });
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [known, uri]);

  if (known !== null) return known;
  return read !== null && read.uri === uri ? read.size : null;
}
