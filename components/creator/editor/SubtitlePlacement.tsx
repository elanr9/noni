// Stand in for the auto transcribed subtitles the render pass burns in.
// Mirrors renderAdapter.ts: two centred lines, 4.8 vmin, 62% wide, soft
// shadow. The creator can only move it up or down.
import type { JSX } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { TikTokSans_700Bold, useFonts } from '@expo-google-fonts/tiktok-sans';

import { color } from '../../../theme/tokens';
import { DragPlacement } from '../DragPlacement';

const FONT_VMIN = 4.8;
const LINE_HEIGHT = 1.25;
const WIDTH = 0.62;

export function SubtitlePlacement(props: {
  y: number;
  stageWidth: number;
  stageHeight: number;
  onMove?: (y: number) => void;
  onDragStart?: () => void;
}): JSX.Element {
  const { y, stageWidth, stageHeight, onMove, onDragStart } = props;
  const [fontLoaded] = useFonts({ TikTokSans_700Bold });
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
        <Text
          style={[
            styles.text,
            {
              fontSize,
              lineHeight: fontSize * LINE_HEIGHT,
              fontFamily: fontLoaded ? 'TikTokSans_700Bold' : undefined,
            },
          ]}
        >
          Your subtitles{'\n'}show up here
        </Text>
      </View>
    </DragPlacement>
  );
}

const styles = StyleSheet.create({
  block: {
    alignItems: 'center',
  },
  text: {
    color: color.white,
    fontWeight: '600',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
});
