// Render-accurate guides inside the 9:16 cover frame: a faint ghost of the
// TikTok UI and, when the post has subtitles, the two-line subtitle band at
// its real size and spot. Guides only; they never take touches.
import type { JSX } from 'react';
import { StyleSheet, View } from 'react-native';

import { CLASSIC_TEXT_COLOR, OVERLAY_TEXT_SPEC } from '../../../lib/overlay-boxes';
import { OutlinedText } from '../../ui/OutlinedText';
import { TikTokChrome } from '../slides/TikTokChrome';
import { frameStyle, type StageFrame } from './stageFrame';

/** Mirrors renderAdapter.ts subtitleStyle: 3.6 vmin, 62% wide, two lines. */
const SUBTITLE_FONT_VMIN = 3.6;
const SUBTITLE_WIDTH = 0.62;
const SUBTITLE_LINES = 2;

/** Frame-fraction rectangle. */
export type FrameRect = { left: number; top: number; right: number; bottom: number };

export function subtitleFontSize(frame: StageFrame): number {
  return (Math.min(frame.width, frame.height) / 100) * SUBTITLE_FONT_VMIN;
}

/** Where the subtitle block sits, as frame fractions. */
export function subtitleBandRect(frame: StageFrame, y: number): FrameRect {
  const heightPx =
    subtitleFontSize(frame) * OVERLAY_TEXT_SPEC.condensed.lineHeight * SUBTITLE_LINES;
  const half = heightPx / frame.height / 2;
  return {
    left: (1 - SUBTITLE_WIDTH) / 2,
    right: 1 - (1 - SUBTITLE_WIDTH) / 2,
    top: y - half,
    bottom: y + half,
  };
}

export function rectsOverlap(a: FrameRect, b: FrameRect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

export function FrameGuides(props: {
  frame: StageFrame;
  /** Subtitle block centre as a frame fraction, null when subtitles are off. */
  subtitlesY: number | null;
}): JSX.Element {
  const { frame, subtitlesY } = props;
  const fontSize = subtitleFontSize(frame);
  return (
    <View style={frameStyle(frame)} pointerEvents="none">
      <View style={styles.chrome} pointerEvents="none">
        <TikTokChrome stageWidth={frame.width} stageHeight={frame.height} />
      </View>
      {subtitlesY !== null ? (
        <View
          style={[
            styles.band,
            {
              width: frame.width * SUBTITLE_WIDTH,
              left: frame.width * ((1 - SUBTITLE_WIDTH) / 2),
              top:
                subtitlesY * frame.height -
                (fontSize * OVERLAY_TEXT_SPEC.condensed.lineHeight * SUBTITLE_LINES) / 2,
            },
          ]}
        >
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
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  chrome: {
    ...StyleSheet.absoluteFill,
    opacity: 0.55,
  },
  band: {
    position: 'absolute',
    alignItems: 'center',
    opacity: 0.85,
  },
});
