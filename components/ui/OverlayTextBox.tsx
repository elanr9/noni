// One on-screen text box drawn the way TikTok's text tool draws it. Classic
// is outlined letters; a colored box gives every wrapped line its own bubble
// hugging that line. Lines are wrapped with the font's own advance widths
// (lib/overlay-text-metrics) so the render breaks in the same places.
import type { JSX, ReactNode } from 'react';
import { Dimensions, StyleSheet, Text, View, type TextStyle } from 'react-native';

import {
  OVERLAY_TEXT_SPEC,
  overlayBoxFill,
  overlayTextContrast,
} from '../../lib/overlay-boxes';
import { wrapOverlayLines } from '../../lib/overlay-text-metrics';
import { OutlinedText } from './OutlinedText';

export function overlayTextStyle(fontSize: number, fontLoaded = true): TextStyle {
  return {
    fontFamily: fontLoaded ? OVERLAY_TEXT_SPEC.fontFamily : undefined,
    fontWeight: '700',
    fontSize,
    lineHeight: fontSize * OVERLAY_TEXT_SPEC.lineHeight,
    textAlign: 'center',
  };
}

export function OverlayTextBox(props: {
  text: string;
  color: string;
  bg: boolean;
  /** Device px, already scaled to the stage. */
  fontSize: number;
  /** Widest the box may wrap, in px. Defaults to the spec fraction of the window. */
  maxWidth?: number;
  fontLoaded?: boolean;
  /** Replaces the visible text (an editing TextInput sharing the same metrics). */
  children?: ReactNode;
}): JSX.Element {
  const { text, color, bg, fontSize, maxWidth, fontLoaded = true, children } = props;

  const padX = fontSize * OVERLAY_TEXT_SPEC.boxPadX;
  const padY = fontSize * OVERLAY_TEXT_SPEC.boxPadY;
  const radius = fontSize * OVERLAY_TEXT_SPEC.boxRadius;
  const boxWidth =
    maxWidth ?? Dimensions.get('window').width * OVERLAY_TEXT_SPEC.maxWidth;
  const wrapWidth = Math.max(0, boxWidth - 2 * padX);
  const textStyle = overlayTextStyle(fontSize, fontLoaded);
  const lines = wrapOverlayLines(text, wrapWidth / fontSize);
  const wrapped = lines.join('\n');

  if (!bg) {
    return (
      <View style={{ maxWidth: boxWidth }}>
        <OutlinedText text={wrapped} fontSize={fontSize} color={color} style={textStyle}>
          {children}
        </OutlinedText>
      </View>
    );
  }

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
            borderRadius: radius,
          }}
        >
          {children}
        </View>
      </View>
    );
  }

  // Bubbles overlap by the pad, so they are laid down first with invisible
  // letters sizing them and the ink is drawn on an identical layer on top.
  // Otherwise a lower bubble would cover the descenders of the line above.
  const layer = (withFill: boolean) =>
    lines.map((line, i) =>
      line.length === 0 ? (
        <View key={i} style={{ height: fontSize * OVERLAY_TEXT_SPEC.lineHeight }} />
      ) : (
        <View
          key={i}
          style={{
            backgroundColor: withFill ? fill : 'transparent',
            paddingHorizontal: padX,
            paddingVertical: padY,
            borderRadius: radius,
            marginTop: i === 0 ? 0 : -2 * padY,
          }}
        >
          <Text style={[textStyle, { color: withFill ? 'transparent' : ink }]}>{line}</Text>
        </View>
      ),
    );

  return (
    <View style={[styles.stack, { maxWidth: boxWidth }]}>
      {layer(true)}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.stack]}>
        {layer(false)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    alignItems: 'center',
  },
});
