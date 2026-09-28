// The exact 1080x1920 render frame scaled to fit (letterboxed, never the phone
// aspect): native composition player underneath, a faint TikTok chrome guide
// above it, then the interactive layers: inset media, the creator's text
// boxes, the subtitle block, and the crop gesture while the crop tool is
// open. Memoised: the parent hands it stable callbacks so playhead ticks do
// not re-render it.
import { forwardRef, memo, type JSX } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { BriefSegment } from '../../../lib/briefs-api';
import type { OverlayBox } from '../../../lib/overlay-boxes';
import type { EditCrop } from '../../../lib/video-edit';
import {
  VideoEditorPreview,
  type NativeTimeline,
  type PreviewErrorEvent,
  type PreviewReadyEvent,
  type PreviewTimeEvent,
  type VideoEditorPreviewHandle,
} from '../../../modules/video-editor';
import { color } from '../../../theme/tokens';
import { Icon } from '../../ui/Icon';
import type { ShotPreview } from '../SegmentOverlayPreview';
import { FrameFit } from '../slides/FrameFit';
import { TikTokChrome } from '../slides/TikTokChrome';
import { CropGesture } from './CropGesture';
import { StageInset, type InsetPlacement } from './StageInset';
import { StageSubtitles } from './StageSubtitles';
import type { AvoidBand, BoxPlacement } from './StageTextBox';
import { TextBoxLayer } from './TextBoxLayer';

export type StageSize = { w: number; h: number };

export type EditorStageProps = {
  timeline: NativeTimeline;
  playing: boolean;
  onTime: (event: PreviewTimeEvent) => void;
  onReady: (event: PreviewReadyEvent) => void;
  onEnd: () => void;
  onError: (event: PreviewErrorEvent) => void;
  onTogglePlay: () => void;
  onLayoutCard: (size: StageSize) => void;
  cardSize: StageSize | null;
  segment: BriefSegment | null;
  shot: ShotPreview | null;
  /** Where the inset media sits (creator edits applied); ignored without a shot. */
  inset: InsetPlacement | null;
  insetSelected: boolean;
  /** Effective text boxes of the clip under the playhead (creator edits applied). */
  boxes: OverlayBox[];
  selectedBoxId: string | null;
  /** Cue gates: the playhead is inside the text or media window of the segment. */
  showText: boolean;
  showMedia: boolean;
  /** Subtitle block centre and the line spoken at the playhead; null hides it. */
  subtitles: { y: number; text: string | null } | null;
  /** Band the dragged text boxes should stay clear of (the subtitles). */
  avoidBand: AvoidBand | null;
  onSelectBox: (boxId: string) => void;
  onEditBox: (boxId: string) => void;
  onCommitBox: (boxId: string, placement: BoxPlacement) => void;
  onSelectInset: () => void;
  onCommitInset: (placement: InsetPlacement) => void;
  onMoveSubtitles: (y: number) => void;
  onDragStart: () => void;
  /** Live crop while the crop tool is open; null otherwise. */
  crop: EditCrop | null;
  onCropChange: (crop: EditCrop) => void;
  onCropCommit: (crop: EditCrop) => void;
};

export const EditorStage = memo(
  forwardRef<VideoEditorPreviewHandle, EditorStageProps>(function EditorStage(
    props,
    ref,
  ): JSX.Element {
    const {
      timeline,
      playing,
      onTime,
      onReady,
      onEnd,
      onError,
      onTogglePlay,
      onLayoutCard,
      cardSize,
      segment,
      shot,
      inset,
      insetSelected,
      boxes,
      selectedBoxId,
      showText,
      showMedia,
      subtitles,
      avoidBand,
      onSelectBox,
      onEditBox,
      onCommitBox,
      onSelectInset,
      onCommitInset,
      onMoveSubtitles,
      onDragStart,
      crop,
      onCropChange,
      onCropCommit,
    } = props;

    const cropping = crop !== null;
    const liveCrop = crop ?? { scale: 1, x: 0, y: 0 };
    const showInset =
      segment !== null && segment.layout !== 'green_screen' && shot !== null && inset !== null;
    const layers = !cropping && cardSize !== null && cardSize.w > 0 && cardSize.h > 0;

    return (
      <FrameFit style={styles.area} frameStyle={styles.card}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={playing ? 'Pause preview' : 'Play preview'}
          onPress={cropping ? undefined : onTogglePlay}
          onLayout={(e) =>
            onLayoutCard({
              w: e.nativeEvent.layout.width,
              h: e.nativeEvent.layout.height,
            })
          }
          style={StyleSheet.absoluteFill}
        >
          {VideoEditorPreview !== null ? (
            <VideoEditorPreview
              ref={ref}
              timeline={timeline}
              playing={playing}
              onTime={onTime}
              onReady={onReady}
              onEnd={onEnd}
              onError={onError}
              style={[
                StyleSheet.absoluteFill,
                cropping && cardSize !== null
                  ? {
                      transform: [
                        { translateX: liveCrop.x * cardSize.w },
                        { translateY: liveCrop.y * cardSize.h },
                        { scale: liveCrop.scale },
                      ],
                    }
                  : null,
              ]}
            />
          ) : null}

          {cardSize !== null && !cropping ? (
            <TikTokChrome stageWidth={cardSize.w} stageHeight={cardSize.h} />
          ) : null}

          {layers && showInset && shot !== null && inset !== null && showMedia ? (
            <StageInset
              shot={shot}
              placement={inset}
              stageWidth={cardSize.w}
              stageHeight={cardSize.h}
              selected={insetSelected}
              onSelect={onSelectInset}
              onDragStart={onDragStart}
              onCommit={onCommitInset}
            />
          ) : null}

          {layers && showText && boxes.length > 0 ? (
            <TextBoxLayer
              boxes={boxes}
              stageWidth={cardSize.w}
              stageHeight={cardSize.h}
              selectedBoxId={selectedBoxId}
              avoidBand={avoidBand}
              onSelect={onSelectBox}
              onEdit={onEditBox}
              onDragStart={onDragStart}
              onCommit={onCommitBox}
            />
          ) : null}

          {layers && subtitles !== null ? (
            <StageSubtitles
              y={subtitles.y}
              text={subtitles.text}
              stageWidth={cardSize.w}
              stageHeight={cardSize.h}
              onMove={onMoveSubtitles}
              onDragStart={onDragStart}
            />
          ) : null}

          {cropping && cardSize !== null ? (
            <CropGesture
              crop={liveCrop}
              stageWidth={cardSize.w}
              stageHeight={cardSize.h}
              onChange={onCropChange}
              onCommit={onCropCommit}
            />
          ) : null}

          {!playing && !cropping ? (
            <View style={styles.playWrap} pointerEvents="none">
              <View style={styles.play}>
                <Icon name="play" size={26} color={color.white} />
              </View>
            </View>
          ) : null}
        </Pressable>
      </FrameFit>
    );
  }),
);

const styles = StyleSheet.create({
  area: {
    flex: 1,
    marginHorizontal: 16,
    marginBottom: 4,
  },
  card: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#111',
  },
  playWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  play: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 4,
  },
});
