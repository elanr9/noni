// JS side of the local VideoEditor native module (iOS). One timeline JSON
// drives both the live preview view and the export, so what the creator
// sees is exactly what uploads. Absent module (Android, Expo Go, stale dev
// client) is reported through isVideoEditorAvailable so callers can fall
// back to the plain review.
import { requireNativeViewManager, requireOptionalNativeModule } from 'expo-modules-core';
import { Platform, type StyleProp, type ViewStyle } from 'react-native';
import type { ComponentType, Ref } from 'react';

import type { EditCrop, EditPiece, EditTimeline } from '../../lib/video-edit';

/** Piece as the native side reads it. Times are source milliseconds. */
export type NativePiece = {
  uri: string;
  inMs: number;
  outMs: number;
  speed: number;
  muted: boolean;
  crop: EditCrop | null;
};

export type NativeTimeline = { pieces: NativePiece[] };

export type ExportResult = { uri: string; durationMs: number };

export type PreviewTimeEvent = { nativeEvent: { positionMs: number } };
export type PreviewReadyEvent = { nativeEvent: { durationMs: number } };
export type PreviewErrorEvent = { nativeEvent: { message: string } };

export type VideoEditorPreviewProps = {
  timeline: NativeTimeline;
  /** Continuous playback flag. Native pauses itself at the end and fires onEnd. */
  playing: boolean;
  style?: StyleProp<ViewStyle>;
  /** ~30 times per second while playing and after every seek. */
  onTime?: (event: PreviewTimeEvent) => void;
  /** After each timeline rebuild finishes loading. */
  onReady?: (event: PreviewReadyEvent) => void;
  onEnd?: () => void;
  onError?: (event: PreviewErrorEvent) => void;
};

export type VideoEditorPreviewHandle = {
  /** precise = frame accurate (release, taps); imprecise is for scrubbing. */
  seekTo(positionMs: number, precise: boolean): Promise<void>;
};

type NativeModuleShape = {
  exportTimeline(timeline: NativeTimeline): Promise<ExportResult>;
  thumbnails(uri: string, timesMs: number[], height: number): Promise<string[]>;
  cancelExport(): Promise<void>;
};

const nativeModule =
  Platform.OS === 'ios'
    ? requireOptionalNativeModule<NativeModuleShape>('VideoEditor')
    : null;

export function isVideoEditorAvailable(): boolean {
  return nativeModule !== null;
}

function required(): NativeModuleShape {
  if (!nativeModule) {
    throw new Error(
      'VideoEditor native module is not available. Rebuild the dev client to include modules/video-editor.',
    );
  }
  return nativeModule;
}

export function toNativePiece(piece: EditPiece): NativePiece {
  return {
    uri: piece.sourceUri,
    inMs: piece.inMs,
    outMs: piece.outMs,
    speed: piece.speed,
    muted: piece.muted,
    crop: piece.crop,
  };
}

export function toNativeTimeline(timeline: EditTimeline): NativeTimeline {
  return { pieces: timeline.pieces.map(toNativePiece) };
}

/** Render the pieces into one mp4 in the cache directory. */
export async function exportTimeline(timeline: NativeTimeline): Promise<ExportResult> {
  if (timeline.pieces.length === 0) {
    throw new Error('exportTimeline needs at least one piece.');
  }
  return required().exportTimeline(timeline);
}

export async function cancelExport(): Promise<void> {
  if (!nativeModule) return;
  await nativeModule.cancelExport();
}

/** JPEG poster frames at the given source times, scaled to `height` px. */
export async function thumbnails(
  uri: string,
  timesMs: number[],
  height: number,
): Promise<string[]> {
  if (timesMs.length === 0) return [];
  return required().thumbnails(uri, timesMs, height);
}

type NativeViewProps = VideoEditorPreviewProps & { ref?: Ref<VideoEditorPreviewHandle> };

export const VideoEditorPreview: ComponentType<NativeViewProps> | null =
  nativeModule !== null
    ? (requireNativeViewManager('VideoEditor') as ComponentType<NativeViewProps>)
    : null;
