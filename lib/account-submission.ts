import { useSyncExternalStore } from 'react';

import {
  submitCreatorAccount,
  uploadVerificationAsset,
  type VerificationUploadKind,
} from './creator-accounts-api';
import { refreshSetupState } from './setup';

/**
 * Warm-up proof uploads run detached from the screen that started them, so a
 * creator sees "Application submitted" straight away and can leave. The state
 * lives in a module store rather than component state because the screen is
 * usually gone long before the upload finishes, and a silent failure would let
 * someone believe they had applied when nothing reached the queue.
 */

export type AccountSubmissionStatus = 'idle' | 'sending' | 'failed';

export type AccountSubmission = {
  status: AccountSubmissionStatus;
  error: string | null;
};

type LocalFile = { uri: string; mimeType: string };

export type AccountSubmissionInput = {
  companyId: string;
  creatorId: string;
  tiktokHandle: string;
  instagramHandle: string;
  instagramScreenshotPath: string;
  tiktokScreenshotPath: string;
  /** A newly picked file, or the path already stored from an earlier submit. */
  instagramRecording: LocalFile | { path: string };
  tiktokRecording: LocalFile | { path: string };
};

const IDLE: AccountSubmission = { status: 'idle', error: null };

let snapshot: AccountSubmission = IDLE;
let lastInput: AccountSubmissionInput | null = null;
const listeners = new Set<() => void>();

function setSnapshot(next: AccountSubmission): void {
  snapshot = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): AccountSubmission {
  return snapshot;
}

export function useAccountSubmission(): AccountSubmission {
  return useSyncExternalStore(subscribe, getSnapshot);
}

export function clearAccountSubmission(): void {
  lastInput = null;
  setSnapshot(IDLE);
}

async function resolvePath(
  companyId: string,
  creatorId: string,
  kind: VerificationUploadKind,
  file: LocalFile | { path: string },
): Promise<string> {
  if ('path' in file) return file.path;
  return uploadVerificationAsset({
    companyId,
    creatorId,
    kind,
    localUri: file.uri,
    contentType: file.mimeType,
  });
}

async function run(input: AccountSubmissionInput): Promise<void> {
  const instagramRecordingPath = await resolvePath(
    input.companyId,
    input.creatorId,
    'instagram-recording',
    input.instagramRecording,
  );
  const tiktokRecordingPath = await resolvePath(
    input.companyId,
    input.creatorId,
    'tiktok-recording',
    input.tiktokRecording,
  );
  await submitCreatorAccount({
    companyId: input.companyId,
    creatorId: input.creatorId,
    tiktokHandle: input.tiktokHandle,
    instagramHandle: input.instagramHandle,
    instagramRecordingPath,
    tiktokRecordingPath,
    instagramScreenshotPath: input.instagramScreenshotPath,
    tiktokScreenshotPath: input.tiktokScreenshotPath,
  });
  await refreshSetupState(input.companyId, input.creatorId);
}

/** Returns immediately. Progress and failure are read from the store. */
export function startAccountSubmission(input: AccountSubmissionInput): void {
  lastInput = input;
  setSnapshot({ status: 'sending', error: null });
  void run(input)
    .then(() => setSnapshot(IDLE))
    .catch((e: unknown) => {
      setSnapshot({
        status: 'failed',
        error: e instanceof Error ? e.message : 'The upload did not finish.',
      });
    });
}

export function retryAccountSubmission(): void {
  if (lastInput === null) return;
  startAccountSubmission(lastInput);
}
