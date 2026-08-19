import { File } from 'expo-file-system';
import { FileSystemUploadType, uploadAsync } from 'expo-file-system/legacy';

import { supabase } from './supabase';

/**
 * Video has to leave the device through a native upload. Reading a recording
 * into a Blob and handing it to the storage client pulls the whole file into
 * JS memory and iOS tears the socket down partway through with "The network
 * connection was lost", which is every large warm-up and clip upload that has
 * failed. uploadAsync streams from disk, so length stops mattering, and a lost
 * connection is retried instead of thrown straight at the creator.
 */

const ATTEMPTS = 3;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Bytes on disk, without reading the file into memory. */
export function fileSize(localUri: string): number {
  return new File(localUri).size;
}

/** Storage errors arrive as a JSON body; fall back to the raw text. */
function storageMessage(body: string, status: number): string {
  try {
    const parsed = JSON.parse(body) as { message?: string; error?: string };
    const message = parsed.message ?? parsed.error;
    if (message !== undefined && message.length > 0) return message;
  } catch {
    /* not JSON */
  }
  return body.length > 0 ? body : `Upload failed with status ${status}`;
}

export async function uploadFileToStorage(params: {
  bucket: string;
  path: string;
  localUri: string;
  contentType: string;
  upsert?: boolean;
}): Promise<void> {
  const upsert = params.upsert ?? false;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    try {
      // Signed per attempt: a token is spent once an object lands at the path,
      // so a reused one would fail for the wrong reason after a partial upload.
      const { data, error } = await supabase.storage
        .from(params.bucket)
        .createSignedUploadUrl(params.path, { upsert });
      if (error) throw error;

      const result = await uploadAsync(data.signedUrl, params.localUri, {
        httpMethod: 'PUT',
        uploadType: FileSystemUploadType.BINARY_CONTENT,
        headers: {
          'content-type': params.contentType,
          'cache-control': 'max-age=3600',
          'x-upsert': String(upsert),
        },
      });
      if (result.status >= 200 && result.status < 300) return;
      throw new Error(storageMessage(result.body, result.status));
    } catch (e) {
      lastError = e instanceof Error ? e : new Error('The upload failed');
      if (attempt < ATTEMPTS) await wait(attempt * 1500);
    }
  }

  throw lastError ?? new Error('The upload failed');
}
