// Stand in for the auto transcribed subtitles the render pass burns in.
// Mirrors renderAdapter.ts: two centred lines, 6.2 vmin, 80% wide, in the
// condensed TikTok look. The creator can only move it up or down.
import type { JSX } from 'react';
import { StyleSheet, View } from 'react-native';

import { CLASSIC_TEXT_COLOR, OVERLAY_TEXT_SPEC } from '../../../lib/overlay-boxes';
import { OutlinedText } from '../../ui/OutlinedText';
import { DragPlacement } from '../DragPlacement';

const FONT_VMIN = 6.2;
const WIDTH = 0.8;

export function SubtitlePlacement(props: {
  y: number;
  stageWidth: number;
  stageHeight: number;
  onMove?: (y: number) => void;
  onDragStart?: () => void;
}): JSX.Element {
  const { y, stageWidth, stageHeight, onMove, onDragStart } = props;
  const fontSize = (Math.min(stageWidth, stageHeight) / 100) * FONT_VMIN;
  return (
    <DragPlacement
      x={0.5}
      y={y}
      stageWidth={stageWidth}
      stageHeight={stageHeight}
      axis="y"
      onMove={onMove ? (_x, ny) => onMove(ny) : undefined}
      onDragStart={onDragStart}
      style={{ width: stageWidth * WIDTH }}
    >
      <View style={styles.block}>
        <OutlinedText
          text={'Your subtitles\nshow up here'}
          fontSize={fontSize}
          color={CLASSIC_TEXT_COLOR}
          style={{
            lineHeight: fontSize * OVERLAY_TEXT_SPEC.condensed.lineHeight,
            textAlign: 'center',
          }}
        />
      </View>
    </DragPlacement>
  );
}

const styles = StyleSheet.create({
  block: {
    alignItems: 'center',
  },
});
