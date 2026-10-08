// JS side of the local VideoEditor native module (iOS). One timeline JSON
// drives both the live preview view and the export, so what the creator
// sees is exactly what uploads. Absent module (Android, Expo Go, stale dev
// client) is reported through isVideoEditorAvailable so callers can fall
// back to the plain review.
import { requireNativeViewManager, requireOptionalNativeModule } from 'expo-modules-core';
import { Platform, type StyleProp, type ViewStyle } from 'react-native';
import type { ComponentType, Ref } from 'react';

import {
  assetById,
  blockDurationMs,
  type AssetKind,
  type BlockLayout,
  type VideoDocument,
} from '../../lib/edit-document';
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

/** One cell of a studio block. Image cells send kind 'image' and no media;
 * the native side keeps their time with an empty range and JS draws them. */
export type NativeCell = {
  kind: AssetKind;
  uri: string;
  inMs: number;
  outMs: number;
  speed: number;
  muted: boolean;
  crop: EditCrop | null;
};

export type NativeBlock = { layout: BlockLayout; durationMs: number; cells: NativeCell[] };

/** Studio document shape: two video and two audio tracks, 1080x1920 render. */
export type NativeBlockTimeline = { blocks: NativeBlock[] };

export type ExportResult = { uri: string; durationMs: number };

/** Where speech starts and ends in a clip, in source milliseconds. Equals
 * the whole clip when there is no audio track or nothing clear to trim. */
export type SpeechBounds = { startMs: number; endMs: number; durationMs: number };

export type PreviewTimeEvent = { nativeEvent: { positionMs: number } };
export type PreviewReadyEvent = { nativeEvent: { durationMs: number } };
export type PreviewErrorEvent = { nativeEvent: { message: string } };

export type VideoEditorPreviewProps = {
  timeline: NativeTimeline | NativeBlockTimeline;
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
  speechBounds(uri: string): Promise<SpeechBounds>;
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

/** A video cell without a local file plays as an image cell (black on the
 * native side) until its asset is available on this device. */
export function toNativeBlockTimeline(doc: VideoDocument): NativeBlockTimeline {
  return {
    blocks: doc.blocks.map((block) => ({
      layout: block.layout,
      durationMs: blockDurationMs(block),
      cells: block.cells.map((cell) => {
        const asset = assetById(doc, cell.assetId);
        const uri = asset?.kind === 'video' ? asset.localUri : null;
        return {
          kind: uri ? 'video' : 'image',
          uri: uri ?? '',
          inMs: cell.inMs,
          outMs: cell.outMs,
          speed: cell.speed,
          muted: cell.muted,
          crop: cell.crop,
        };
      }),
    })),
  };
}

/** True when at least one cell can play natively. */
export function hasNativeVideo(timeline: NativeBlockTimeline): boolean {
  return timeline.blocks.some((b) => b.cells.some((c) => c.kind === 'video'));
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

/** Analyze the clip's audio on device and return the speech range. */
export async function speechBounds(uri: string): Promise<SpeechBounds> {
  return required().speechBounds(uri);
}

type NativeViewProps = VideoEditorPreviewProps & { ref?: Ref<VideoEditorPreviewHandle> };

export const VideoEditorPreview: ComponentType<NativeViewProps> | null =
  nativeModule !== null
    ? (requireNativeViewManager('VideoEditor') as ComponentType<NativeViewProps>)
    : null;
