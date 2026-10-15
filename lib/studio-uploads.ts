// Background upload of studio assets. Any asset in the document with a
// local file and no storage path is uploaded to the videos bucket and its
// storagePath written back without touching undo history. What is in flight
// and what already landed live at module scope, keyed by assignment and
// asset id (one asset id, such as a feature screenshot, can appear in several
// assignments), so undo,
// redo and the record to edit hop (two hook instances) never upload twice.
import { File, Paths } from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { updateAsset, type EditDocument, type MediaAsset } from './edit-document';
import { uploadFileToStorage, waitForStableFile } from './storage-upload';
import { useStudioStore } from './studio-store';

export function studioAssetPath(companyId: string, assignmentId: string, asset: MediaAsset): string {
  return `${companyId}/${assignmentId}/asset-${asset.id}.${asset.kind === 'video' ? 'mp4' : 'jpg'}`;
}

/** Images are re-encoded to JPEG so camera roll HEIC never reaches the bucket. */
async function prepareUpload(asset: MediaAsset, localUri: string): Promise<{ uri: string; contentType: string }> {
  if (asset.kind === 'video') return { uri: localUri, contentType: 'video/mp4' };
  const result = await ImageManipulator.manipulateAsync(localUri, [], {
    compress: 0.9,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  return { uri: result.uri, contentType: 'image/jpeg' };
}

function withPath(doc: EditDocument, assetId: string, storagePath: string): EditDocument {
  return doc.format === 'video'
    ? updateAsset(doc, assetId, { storagePath })
    : updateAsset(doc, assetId, { storagePath });
}

export type StudioUploadState = {
  pending: number;
  failed: number;
  /** Assets with no storage path whose local file is gone; they can never upload. */
  missing: string[];
  retry(): void;
};

const inFlight = new Set<string>();
const landed = new Map<string, string>();
const keyOf = (assignmentId: string, assetId: string) => `${assignmentId}:${assetId}`;

function fileExists(uri: string): boolean {
  try {
    return new File(uri).exists;
  } catch {
    return false;
  }
}

const KEPT_DIR = /\/(noni-takes|noni-features)\/([^/]+)$/;

/**
 * The readable local file for a stored localUri, or null when it is gone.
 * Files kept in the documents directory are found again after the app's
 * container path changes (iOS app updates move it). Non file URIs are
 * trusted as they are.
 */
export function resolveLocalUri(uri: string | null): string | null {
  if (!uri) return null;
  if (!uri.startsWith('file:')) return uri;
  if (fileExists(uri)) return uri;
  const kept = KEPT_DIR.exec(uri);
  if (!kept) return null;
  try {
    const moved = new File(Paths.document, kept[1], kept[2]);
    return moved.exists ? moved.uri : null;
  } catch {
    return null;
  }
}

function localFileExists(uri: string): boolean {
  return resolveLocalUri(uri) !== null;
}

/** Ids of assets that are not uploaded and have no readable local file. */
export function missingAssetIds(
  assets: readonly MediaAsset[],
  assignmentId: string,
  exists: (uri: string) => boolean = localFileExists,
): string[] {
  return assets
    .filter((a) => {
      const key = keyOf(assignmentId, a.id);
      return !a.storagePath && !landed.has(key) && !inFlight.has(key) && (!a.localUri || !exists(a.localUri));
    })
    .map((a) => a.id);
}

export function useStudioUploads(params: { companyId: string; assignmentId: string } | null): StudioUploadState {
  const document = useStudioStore((s) => s.document);
  const failed = useRef(new Set<string>());
  const [failedCount, setFailedCount] = useState(0);

  useEffect(() => {
    if (!params || !document) return;
    const { companyId, assignmentId } = params;
    const { ownerId } = useStudioStore.getState();
    if (ownerId !== null && ownerId !== assignmentId) return;

    for (const asset of document.assets) {
      if (asset.storagePath) continue;
      const key = keyOf(assignmentId, asset.id);
      const known = landed.get(key);
      if (known) {
        useStudioStore.setState((s) => ({
          document: s.document ? withPath(s.document, asset.id, known) : s.document,
          dirty: true,
        }));
        continue;
      }
      if (!asset.localUri || inFlight.has(key) || failed.current.has(asset.id)) continue;
      const localUri = resolveLocalUri(asset.localUri);
      if (!localUri) continue;

      inFlight.add(key);
      const path = studioAssetPath(companyId, assignmentId, asset);
      void (async () => {
        try {
          await waitForStableFile(localUri);
          const prepared = await prepareUpload(asset, localUri);
          await uploadFileToStorage({ bucket: 'videos', path, localUri: prepared.uri, contentType: prepared.contentType });
          landed.set(key, path);
          useStudioStore.setState((s) => ({
            document: s.document ? withPath(s.document, asset.id, path) : s.document,
            dirty: true,
          }));
        } catch (e) {
          console.warn('studio asset upload failed', asset.id, e);
          failed.current.add(asset.id);
          setFailedCount(failed.current.size);
        } finally {
          inFlight.delete(key);
        }
      })();
    }
  }, [params, document, failedCount]);

  // File checks are synchronous; run them only when the asset list changes,
  // not on every document edit or gesture frame.
  const assets = document?.assets;
  const assetKey = assets ? assets.map((a) => `${a.id}|${a.localUri ?? ''}|${a.storagePath ?? ''}`).join('\n') : '';
  const assignmentKey = params?.assignmentId ?? '';
  const missing = useMemo(
    () => (assets && assignmentKey ? missingAssetIds(assets, assignmentKey) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [assetKey, assignmentKey],
  );
  const pending = Math.max(
    0,
    (document ? document.assets.filter((a) => !a.storagePath && a.localUri && !missing.includes(a.id)).length : 0) - failedCount,
  );
  const retry = useCallback(() => {
    failed.current.clear();
    setFailedCount(0);
  }, []);
  return { pending, failed: failedCount, missing, retry };
}
