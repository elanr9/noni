// Background upload of studio assets. Any asset in the document with a
// local file and no storage path is uploaded to the videos bucket and its
// storagePath written back without touching undo history. A map of what
// already landed survives undo/redo so nothing uploads twice.
import * as ImageManipulator from 'expo-image-manipulator';
import { useCallback, useEffect, useRef, useState } from 'react';

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

export type StudioUploadState = { pending: number; failed: number; retry(): void };

export function useStudioUploads(params: { companyId: string; assignmentId: string } | null): StudioUploadState {
  const document = useStudioStore((s) => s.document);
  const inFlight = useRef(new Set<string>());
  const landed = useRef(new Map<string, string>());
  const failed = useRef(new Set<string>());
  const [failedCount, setFailedCount] = useState(0);

  useEffect(() => {
    if (!params || !document) return;
    const { companyId, assignmentId } = params;

    for (const asset of document.assets) {
      if (asset.storagePath) continue;
      const known = landed.current.get(asset.id);
      if (known) {
        useStudioStore.setState((s) => ({
          document: s.document ? withPath(s.document, asset.id, known) : s.document,
          dirty: true,
        }));
        continue;
      }
      if (!asset.localUri || inFlight.current.has(asset.id) || failed.current.has(asset.id)) continue;

      inFlight.current.add(asset.id);
      const path = studioAssetPath(companyId, assignmentId, asset);
      const localUri = asset.localUri;
      void (async () => {
        try {
          await waitForStableFile(localUri);
          const prepared = await prepareUpload(asset, localUri);
          await uploadFileToStorage({ bucket: 'videos', path, localUri: prepared.uri, contentType: prepared.contentType });
          landed.current.set(asset.id, path);
          useStudioStore.setState((s) => ({
            document: s.document ? withPath(s.document, asset.id, path) : s.document,
            dirty: true,
          }));
        } catch (e) {
          console.warn('studio asset upload failed', asset.id, e);
          failed.current.add(asset.id);
          setFailedCount(failed.current.size);
        } finally {
          inFlight.current.delete(asset.id);
        }
      })();
    }
  }, [params, document, failedCount]);

  const pending = Math.max(
    0,
    (document ? document.assets.filter((a) => !a.storagePath && a.localUri).length : 0) - failedCount,
  );
  const retry = useCallback(() => {
    failed.current.clear();
    setFailedCount(0);
  }, []);
  return { pending, failed: failedCount, retry };
}
