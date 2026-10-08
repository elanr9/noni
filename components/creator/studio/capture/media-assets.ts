import type { ImagePickerAsset } from 'expo-image-picker';
import * as VideoThumbnails from 'expo-video-thumbnails';

import { newId, type MediaAsset } from '../../../../lib/edit-document';
import { probeDurationMs } from '../../../../lib/submissions';

type Dimensions = { width: number; height: number };

function pickedDimensions(picked: ImagePickerAsset): Dimensions | null {
  return picked.width > 0 && picked.height > 0 ? { width: picked.width, height: picked.height } : null;
}

async function videoDimensions(uri: string): Promise<Dimensions | null> {
  try {
    const thumb = await VideoThumbnails.getThumbnailAsync(uri, { time: 0, quality: 0.1 });
    return thumb.width > 0 && thumb.height > 0 ? { width: thumb.width, height: thumb.height } : null;
  } catch {
    return null;
  }
}

export async function videoAsset(
  uri: string,
  fallbackMs: number,
  known: Dimensions | null = null,
): Promise<MediaAsset> {
  const [durationMs, dims] = await Promise.all([
    probeDurationMs(uri, fallbackMs),
    known ? Promise.resolve(known) : videoDimensions(uri),
  ]);
  return {
    id: newId('a'),
    kind: 'video',
    localUri: uri,
    storagePath: null,
    durationMs,
    width: dims?.width ?? null,
    height: dims?.height ?? null,
  };
}

export function imageAsset(picked: ImagePickerAsset): MediaAsset {
  const dims = pickedDimensions(picked);
  return {
    id: newId('a'),
    kind: 'image',
    localUri: picked.uri,
    storagePath: null,
    durationMs: null,
    width: dims?.width ?? null,
    height: dims?.height ?? null,
  };
}

export async function pickedAsset(picked: ImagePickerAsset): Promise<MediaAsset> {
  if (picked.type === 'video') {
    return videoAsset(picked.uri, picked.duration ?? 0, pickedDimensions(picked));
  }
  return imageAsset(picked);
}
