// The exact 9:16 frame the manager edits in: the clip still or slide photo,
// TikTok chrome guides, the segment's text boxes and inset, and for reels the
// draggable subtitle band. A tap on empty ground clears the selection.
import { useState, type JSX } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { OverlayBox } from '../../../lib/overlay-boxes';
import { color, radius } from '../../../theme/tokens';
import { SlideStage, type SlideInset, type SlideStageEditing } from '../../SlideStage';
import { StageSubtitles } from '../../creator/editor/StageSubtitles';
import { FrameFit } from '../../creator/slides/FrameFit';
import { EditVideoFrame, type VideoStill } from './EditVideoFrame';

export type EditStageBackground =
  | { kind: 'photo'; uri?: string }
  | { kind: 'video'; still: VideoStill; fallback?: VideoStill };

export function EditStage(props: {
  background: EditStageBackground;
  boxes: OverlayBox[];
  inset?: SlideInset;
  editing: SlideStageEditing;
  /** Reels only: the burned-in two-line subtitle block. */
  subtitles?: { y: number; onMove: (y: number) => void };
  onDragStart: () => void;
  onTapEmpty: () => void;
}): JSX.Element {
  const { background, boxes, inset, editing, subtitles, onDragStart, onTapEmpty } = props;
  const [frame, setFrame] = useState({ w: 0, h: 0 });
  const isVideo = background.kind === 'video';

  return (
    <FrameFit style={styles.fit} frameStyle={styles.card}>
      <Pressable
        accessibilityRole="none"
        onPress={onTapEmpty}
        style={StyleSheet.absoluteFill}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          if (width > 0 && height > 0) setFrame({ w: width, h: height });
        }}
      >
        {background.kind === 'video' ? (
          <EditVideoFrame
            key={background.still.uri}
            still={background.still}
            fallback={background.fallback}
          />
        ) : null}
        <SlideStage
          boxes={boxes}
          photoUri={background.kind === 'photo' ? background.uri : undefined}
          placeholder={background.kind === 'photo' && background.uri === undefined ? 'No photo yet' : undefined}
          inset={inset}
          tint={isVideo ? 'transparent' : color.ink800}
          style={StyleSheet.absoluteFill}
          editing={editing}
          onDragStart={onDragStart}
          chrome
        />
        {subtitles !== undefined && frame.w > 0 ? (
          <StageSubtitles
            y={subtitles.y}
            text={null}
            stageWidth={frame.w}
            stageHeight={frame.h}
            onDragStart={onDragStart}
            onMove={subtitles.onMove}
          />
        ) : null}
        <View pointerEvents="none" style={styles.edge} />
      </Pressable>
    </FrameFit>
  );
}

const styles = StyleSheet.create({
  fit: {
    flex: 1,
  },
  card: {
    borderRadius: radius.xl,
    backgroundColor: color.ink800,
    overflow: 'hidden',
  },
  edge: {
    ...StyleSheet.absoluteFill,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.whiteA16,
  },
});
