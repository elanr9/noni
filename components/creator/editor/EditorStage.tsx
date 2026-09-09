// The 9:16 preview card: native composition player underneath, the segment's
// text boxes, screenshot card and subtitle block on top (all draggable), and
// the crop gesture layer while the crop tool is open.
import { forwardRef, useState, type JSX } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { BriefSegment, TextOverlay } from '../../../lib/briefs-api';
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
import { SegmentOverlayPreview, type ShotPreview } from '../SegmentOverlayPreview';
import { CropGesture } from './CropGesture';
import { SubtitlePlacement } from './SubtitlePlacement';

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
  overlay: TextOverlay;
  subtitles: { y: number } | null;
  onMoveBox: (boxId: string, x: number, y: number) => void;
  onMoveCard: (x: number, y: number) => void;
  onMoveSubtitles: (y: number) => void;
  onDragStart: () => void;
  /** Live crop while the crop tool is open; null otherwise. */
  crop: EditCrop | null;
  onCropChange: (crop: EditCrop) => void;
  onCropCommit: (crop: EditCrop) => void;
};

export const EditorStage = forwardRef<VideoEditorPreviewHandle, EditorStageProps>(
  function EditorStage(props, ref): JSX.Element {
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
      overlay,
      subtitles,
      onMoveBox,
      onMoveCard,
      onMoveSubtitles,
      onDragStart,
      crop,
      onCropChange,
      onCropCommit,
    } = props;
    const [area, setArea] = useState<StageSize | null>(null);

    // Fit a 9:16 card inside the available area with a little breathing room.
    let card: StageSize | null = null;
    if (area !== null && area.w > 0 && area.h > 0) {
      const maxW = area.w - 32;
      const maxH = area.h - 8;
      const h = Math.min(maxH, (maxW * 16) / 9);
      card = { w: Math.round((h * 9) / 16), h: Math.round(h) };
    }

    const cropping = crop !== null;
    const liveCrop = crop ?? { scale: 1, x: 0, y: 0 };

    return (
      <View
        style={styles.area}
        onLayout={(e) =>
          setArea({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })
        }
      >
        {card !== null ? (
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
            style={[styles.card, { width: card.w, height: card.h }]}
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
                  cropping
                    ? {
                        transform: [
                          { translateX: liveCrop.x * card.w },
                          { translateY: liveCrop.y * card.h },
                          { scale: liveCrop.scale },
                        ],
                      }
                    : null,
                ]}
              />
            ) : null}

            {!cropping && segment !== null && cardSize !== null && segment.layout !== 'green_screen' ? (
              <SegmentOverlayPreview
                segment={segment}
                shot={shot}
                stageWidth={cardSize.w}
                stageHeight={cardSize.h}
                overlay={overlay}
                onMoveBox={onMoveBox}
                onMoveCard={onMoveCard}
                onDragStart={onDragStart}
              />
            ) : null}

            {!cropping && subtitles !== null && cardSize !== null ? (
              <SubtitlePlacement
                y={subtitles.y}
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
        ) : null}
      </View>
    );
  },
);

const styles = StyleSheet.create({
  area: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
