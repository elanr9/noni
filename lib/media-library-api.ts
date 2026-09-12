// Shared product media: screenshots and screen recordings every campaign
// manager in the company can drop onto a clip. Files live in the private
// brief-assets bucket under <company>/library so the render pass signs them
// exactly like a one-off attach. Placing a library item on a segment is a
// server-side storage copy, so a later library delete never breaks a post.
import * as ImageManipulator from 'expo-image-manipulator';
import * as VideoThumbnails from 'expo-video-thumbnails';

import { fileSize, uploadFileToStorage } from './storage-upload';
import { supabase } from './supabase';
import type { Tables } from './types';

export const BRIEF_ASSETS_BUCKET = 'brief-assets';
/** Matches the brief-assets bucket file_size_limit. */
export const MAX_MEDIA_BYTES = 200 * 1024 * 1024;

export type MediaKind = 'screenshot' | 'recording';

export type MediaLibraryRow = Tables<'media_library'>;

export type MediaLibraryItem = {
  id: string;
  kind: MediaKind;
  /** Manager-given name, e.g. "Highlight video". */
  title: string | null;
  /** Optional: what this shows and how it works, so a post can be written from it. */
  description: string | null;
  path: string;
  thumbPath: string | null;
  /** Signed URL for the file itself. */
  url: string;
  /** Signed poster URL: the thumb for recordings, the file for screenshots. */
  previewUrl: string;
  durationMs: number | null;
  width: number | null;
  height: number | null;
  createdAt: string;
};

/** A file the manager picked on this device, ready to upload. */
export type LocalMedia = {
  uri: string;
  kind: MediaKind;
  contentType: string;
  durationMs: number | null;
  width: number | null;
  height: number | null;
};

const VIDEO_PATH = /\.(mp4|mov|m4v|webm)(\?|#|$)/i;

export function isVideoPath(pathOrUrl: string): boolean {
  return VIDEO_PATH.test(pathOrUrl);
}

export function mediaKindForPath(pathOrUrl: string): MediaKind {
  return isVideoPath(pathOrUrl) ? 'recording' : 'screenshot';
}

/** Storage extension and content type for a local pick. */
export function contentTypeForLocal(uri: string, kind: MediaKind, hint?: string | null): string {
  if (hint && (hint.startsWith('image/') || hint.startsWith('video/'))) {
    if (kind === 'recording') return hint === 'video/quicktime' ? 'video/quicktime' : 'video/mp4';
    return hint === 'image/png' || hint === 'image/webp' ? hint : 'image/jpeg';
  }
  if (kind === 'recording') return /\.mov(\?|#|$)/i.test(uri) ? 'video/quicktime' : 'video/mp4';
  if (/\.png(\?|#|$)/i.test(uri)) return 'image/png';
  if (/\.webp(\?|#|$)/i.test(uri)) return 'image/webp';
  return 'image/jpeg';
}

export function extensionForContentType(contentType: string): string {
  switch (contentType) {
    case 'video/quicktime':
      return 'mov';
    case 'video/mp4':
      return 'mp4';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    default:
      return 'jpg';
  }
}

function sizeLabel(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

function assertUploadable(uri: string): void {
  const size = fileSize(uri);
  if (size > MAX_MEDIA_BYTES) {
    throw new Error(
      `That file is ${sizeLabel(size)} and the limit is ${sizeLabel(MAX_MEDIA_BYTES)}. Trim it and pick it again.`,
    );
  }
}

/**
 * Camera roll photos arrive as HEIC on iPhone, which the bucket and Creatomate
 * both refuse. Every screenshot goes through a JPEG pass; recordings upload
 * as they are.
 */
async function prepareLocal(media: LocalMedia): Promise<{ uri: string; contentType: string }> {
  if (media.kind === 'recording') {
    return { uri: media.uri, contentType: media.contentType };
  }
  const result = await ImageManipulator.manipulateAsync(media.uri, [], {
    compress: 0.88,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  return { uri: result.uri, contentType: 'image/jpeg' };
}

export async function signedMediaUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(BRIEF_ASSETS_BUCKET)
    .createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}

async function toItem(row: MediaLibraryRow): Promise<MediaLibraryItem> {
  const kind: MediaKind = row.kind === 'recording' ? 'recording' : 'screenshot';
  const [url, previewUrl] = await Promise.all([
    signedMediaUrl(row.path),
    row.thumb_path ? signedMediaUrl(row.thumb_path) : null,
  ]);
  return {
    id: row.id,
    kind,
    title: row.title,
    description: row.description,
    path: row.path,
    thumbPath: row.thumb_path,
    url,
    previewUrl: previewUrl ?? url,
    durationMs: row.duration_ms,
    width: row.width,
    height: row.height,
    createdAt: row.created_at,
  };
}

/** Newest first. Both kinds in one call so the toggle flips instantly. */
export async function listMediaLibrary(companyId: string): Promise<MediaLibraryItem[]> {
  const { data, error } = await supabase
    .from('media_library')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return Promise.all((data ?? []).map(toItem));
}

/** Poster for a recording: first frame as a JPEG file on disk. */
async function recordingPoster(uri: string): Promise<string | null> {
  try {
    const thumb = await VideoThumbnails.getThumbnailAsync(uri, { time: 300, quality: 0.8 });
    return thumb.uri;
  } catch {
    return null;
  }
}

/**
 * Upload a local pick into the shared library. Recordings also get a poster
 * so the picker grid never has to decode video to show a tile.
 */
export async function addToMediaLibrary(params: {
  companyId: string;
  createdBy: string;
  media: LocalMedia;
  title?: string | null;
  description?: string | null;
}): Promise<MediaLibraryItem> {
  const { companyId, createdBy, media, title = null, description = null } = params;
  assertUploadable(media.uri);
  const prepared = await prepareLocal(media);
  const stamp = Date.now();
  const ext = extensionForContentType(prepared.contentType);
  const path = `${companyId}/library/${stamp}.${ext}`;

  await uploadFileToStorage({
    bucket: BRIEF_ASSETS_BUCKET,
    path,
    localUri: prepared.uri,
    contentType: prepared.contentType,
  });

  let thumbPath: string | null = null;
  if (media.kind === 'recording') {
    const poster = await recordingPoster(media.uri);
    if (poster) {
      thumbPath = `${companyId}/library/${stamp}-poster.jpg`;
      await uploadFileToStorage({
        bucket: BRIEF_ASSETS_BUCKET,
        path: thumbPath,
        localUri: poster,
        contentType: 'image/jpeg',
      });
    }
  }

  const { data, error } = await supabase
    .from('media_library')
    .insert({
      company_id: companyId,
      kind: media.kind,
      title,
      description,
      path,
      thumb_path: thumbPath,
      duration_ms: media.durationMs,
      width: media.width,
      height: media.height,
      created_by: createdBy,
    })
    .select('*')
    .single();
  if (error) throw error;
  return toItem(data);
}

export async function renameMediaLibraryItem(
  id: string,
  title: string | null,
  description: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('media_library')
    .update({ title, description })
    .eq('id', id);
  if (error) throw error;
}

/**
 * Save a file that already landed on a segment into the library without a
 * second device upload: storage copies it server-side.
 */
export async function copySegmentMediaToLibrary(params: {
  companyId: string;
  createdBy: string;
  segmentPath: string;
  media: LocalMedia;
}): Promise<MediaLibraryItem> {
  const { companyId, createdBy, segmentPath, media } = params;
  const stamp = Date.now();
  const ext = segmentPath.split('.').pop() ?? extensionForContentType(media.contentType);
  const path = `${companyId}/library/${stamp}.${ext}`;
  const { error: copyError } = await supabase.storage
    .from(BRIEF_ASSETS_BUCKET)
    .copy(segmentPath, path);
  if (copyError) throw copyError;

  let thumbPath: string | null = null;
  if (media.kind === 'recording') {
    const poster = await recordingPoster(media.uri);
    if (poster) {
      thumbPath = `${companyId}/library/${stamp}-poster.jpg`;
      await uploadFileToStorage({
        bucket: BRIEF_ASSETS_BUCKET,
        path: thumbPath,
        localUri: poster,
        contentType: 'image/jpeg',
      });
    }
  }

  const { data, error } = await supabase
    .from('media_library')
    .insert({
      company_id: companyId,
      kind: media.kind,
      path,
      thumb_path: thumbPath,
      duration_ms: media.durationMs,
      width: media.width,
      height: media.height,
      created_by: createdBy,
    })
    .select('*')
    .single();
  if (error) throw error;
  return toItem(data);
}

export async function removeFromMediaLibrary(item: MediaLibraryItem): Promise<void> {
  const { error } = await supabase.from('media_library').delete().eq('id', item.id);
  if (error) throw error;
  const paths = [item.path, ...(item.thumbPath ? [item.thumbPath] : [])];
  await supabase.storage.from(BRIEF_ASSETS_BUCKET).remove(paths);
}

function segmentPath(params: { companyId: string; briefId: string; segmentId: string }, ext: string): string {
  return `${params.companyId}/${params.briefId}/${params.segmentId}.${ext}`;
}

/** Old attaches on this segment, whatever their extension, so a swap from a screenshot to a recording leaves nothing behind. */
async function clearSegmentMedia(params: { companyId: string; briefId: string; segmentId: string }): Promise<void> {
  const stale = ['jpg', 'png', 'webp', 'mp4', 'mov'].map((ext) => segmentPath(params, ext));
  await supabase.storage.from(BRIEF_ASSETS_BUCKET).remove(stale);
}

/**
 * Upload a device pick as a segment's media. Streams from disk, so a long
 * screen recording never has to fit in JS memory. Returns the storage path
 * to write into brief_segments.screenshot_url.
 */
export async function uploadSegmentMedia(params: {
  companyId: string;
  briefId: string;
  segmentId: string;
  media: LocalMedia;
}): Promise<string> {
  const { media, ...target } = params;
  assertUploadable(media.uri);
  const prepared = await prepareLocal(media);
  const path = segmentPath(target, extensionForContentType(prepared.contentType));
  await clearSegmentMedia(target);
  await uploadFileToStorage({
    bucket: BRIEF_ASSETS_BUCKET,
    path,
    localUri: prepared.uri,
    contentType: prepared.contentType,
    upsert: true,
  });
  return path;
}

/** Company Brain shots are public URLs in another bucket: fetch and re-upload as a JPEG. */
export async function placeRemoteImageOnSegment(params: {
  companyId: string;
  briefId: string;
  segmentId: string;
  url: string;
}): Promise<string> {
  const { url, ...target } = params;
  const response = await fetch(url);
  if (!response.ok) throw new Error('Could not read the image');
  const blob = await response.blob();
  const path = segmentPath(target, 'jpg');
  await clearSegmentMedia(target);
  const { error } = await supabase.storage
    .from(BRIEF_ASSETS_BUCKET)
    .upload(path, blob, { contentType: 'image/jpeg', upsert: true });
  if (error) throw error;
  return path;
}

/** Place a library item on a segment: one storage copy, no device traffic. */
export async function placeLibraryItemOnSegment(params: {
  companyId: string;
  briefId: string;
  segmentId: string;
  item: Pick<MediaLibraryItem, 'path' | 'kind'>;
}): Promise<string> {
  const { item, ...target } = params;
  const ext = item.path.split('.').pop() ?? (item.kind === 'recording' ? 'mp4' : 'jpg');
  const path = segmentPath(target, ext);
  await clearSegmentMedia(target);
  const { error } = await supabase.storage.from(BRIEF_ASSETS_BUCKET).copy(item.path, path);
  if (error) throw error;
  return path;
}
