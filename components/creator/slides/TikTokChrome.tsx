// Ghost of the TikTok UI on top of a slide: the right action column and the
// bottom caption block. Safe area guides only, never touch input.
import type { JSX } from 'react';
import { StyleSheet, View } from 'react-native';

import { color } from '../../../theme/tokens';
import { TIKTOK_CHROME } from './frame';

const ACTION_COUNT = 5;
const CAPTION_LINES = [0.55, 0.9, 0.7, 0.45];

export function TikTokChrome(props: {
  stageWidth: number;
  stageHeight: number;
}): JSX.Element | null {
  const { stageWidth: w, stageHeight: h } = props;
  if (w <= 0 || h <= 0) return null;

  const { actionColumn, captionArea } = TIKTOK_CHROME;
  const diameter = actionColumn.diameter * w;
  const columnSpan = (actionColumn.bottom - actionColumn.top) * h - diameter;
  const gap = columnSpan / (ACTION_COUNT - 1);
  const lineHeight = Math.max(2, 0.016 * w);
  const captionWidth = (1 - captionArea.left - captionArea.right) * w;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">

      {Array.from({ length: ACTION_COUNT }, (_, i) => (
        <View
          key={i}
          style={[
            styles.action,
            {
              width: diameter,
              height: diameter,
              borderRadius: diameter / 2,
              left: actionColumn.xCenter * w - diameter / 2,
              top: actionColumn.top * h + i * gap,
            },
          ]}
        />
      ))}

      <View
        style={[
          styles.caption,
          {
            left: captionArea.left * w,
            top: captionArea.top * h,
            width: captionWidth,
            gap: lineHeight * 0.9,
          },
        ]}
      >
        {CAPTION_LINES.map((share, i) => (
          <View
            key={i}
            style={[
              styles.captionLine,
              {
                width: captionWidth * share,
                height: lineHeight,
                borderRadius: lineHeight / 2,
              },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  action: {
    position: 'absolute',
    backgroundColor: color.whiteA28,
    borderWidth: 1,
    borderColor: color.whiteA45,
  },
  caption: {
    position: 'absolute',
  },
  captionLine: {
    backgroundColor: color.whiteA45,
  },
});
