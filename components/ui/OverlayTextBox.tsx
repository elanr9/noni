// One on-screen text box drawn the way TikTok's text tool draws it. Bare
// text is condensed white letters with a black stroke; text with background
// is one merged blob of per line bubbles (lib/overlay-bubble-path). Lines are
// wrapped with the font's own advance widths (lib/overlay-text-metrics) so
// the render breaks in the same places.
import type { JSX, ReactNode } from 'react';
import { Dimensions, StyleSheet, Text, View, type TextStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import {
  OVERLAY_TEXT_SPEC,
  overlayBoxFill,
  overlayTextContrast,
} from '../../lib/overlay-boxes';
import { bubbleGeometry } from '../../lib/overlay-bubble-path';
import { measureOverlayLine, wrapOverlayLines } from '../../lib/overlay-text-metrics';
import { OutlinedText } from './OutlinedText';

export function overlayTextStyle(fontSize: number, bg: boolean): TextStyle {
  const font = bg ? OVERLAY_TEXT_SPEC.bubble : OVERLAY_TEXT_SPEC.condensed;
  return {
    fontFamily: font.fontFamily,
    fontWeight: font.fontWeight,
    fontSize,
    lineHeight: fontSize * font.lineHeight,
    textAlign: 'center',
  };
}

/** Wrap width in px for a box: its stored fraction, or the spec default. */
export function overlayWrapWidth(width: number | undefined, stageWidth: number): number {
  return (width ?? OVERLAY_TEXT_SPEC.maxWidth) * stageWidth;
}

/** Narrowest wrap width (px) that still fits the widest single word at this size. */
export function overlayMinWrapWidth(text: string, bg: boolean, fontSize: number): number {
  const font = bg ? 'bubble' : 'condensed';
  const widest = text
    .split(/\s+/)
    .reduce((max, word) => Math.max(max, measureOverlayLine(word, font)), 0);
  const pad = bg ? 2 * fontSize * OVERLAY_TEXT_SPEC.bubble.padX : 0;
  return Math.ceil(widest * fontSize + pad);
}

export function OverlayTextBox(props: {
  text: string;
  color: string;
  bg: boolean;
  /** Device px, already scaled to the stage. */
  fontSize: number;
  /** Widest the box may wrap, in px. Defaults to the spec fraction of the window. */
  maxWidth?: number;
  /** Replaces the visible text (an editing TextInput sharing the same metrics). */
  children?: ReactNode;
}): JSX.Element {
  const { text, color, bg, fontSize, maxWidth, children } = props;

  const boxWidth =
    maxWidth ?? Dimensions.get('window').width * OVERLAY_TEXT_SPEC.maxWidth;
  const textStyle = overlayTextStyle(fontSize, bg);

  if (!bg) {
    const lines = wrapOverlayLines(text, boxWidth / fontSize, 'condensed');
    return (
      <View style={{ maxWidth: boxWidth }}>
        <OutlinedText text={lines.join('\n')} fontSize={fontSize} color={color} style={textStyle}>
          {children}
        </OutlinedText>
      </View>
    );
  }

  const spec = OVERLAY_TEXT_SPEC.bubble;
  const padX = fontSize * spec.padX;
  const padY = fontSize * spec.padY;
  const fill = overlayBoxFill(color);
  const ink = overlayTextContrast(color);

  if (children !== undefined) {
    return (
      <View style={{ maxWidth: boxWidth }}>
        <View
          style={{
            backgroundColor: fill,
            paddingHorizontal: padX,
            paddingVertical: padY,
            borderRadius: fontSize * spec.radius,
          }}
        >
          {children}
        </View>
      </View>
    );
  }

  const lines = wrapOverlayLines(text, (boxWidth - 2 * padX) / fontSize, 'bubble');
  const blob = bubbleGeometry(
    lines.map((line) => measureOverlayLine(line, 'bubble') * fontSize),
    {
      pitch: fontSize * spec.lineHeight,
      padX,
      padY,
      radius: fontSize * spec.radius,
      snap: fontSize * spec.snap,
    },
  );

  return (
    <View style={{ width: blob.width, height: blob.height }}>
      <Svg
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
        width={blob.width}
        height={blob.height}
        viewBox={`0 0 ${blob.width} ${blob.height}`}
      >
        <Path d={blob.path} fill={fill} />
      </Svg>
      <View style={[styles.lines, { paddingVertical: padY }]}>
        {lines.map((line, i) => (
          <Text key={i} style={[textStyle, { color: ink }]}>
            {line.length === 0 ? ' ' : line}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  lines: {
    alignItems: 'center',
  },
});
