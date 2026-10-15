// Text on a slide, drawn the way TikTok's text tool draws it: TikTok Sans,
// outline (white letters with a stroke), box (one bubble per line, letter
// color and box color chosen separately) or plain. OverlayTextBox owns the
// exact metrics. While editing, the tree stays fixed (decoration behind, one
// TextInput in front) so switching styles never remounts the input.

import type { ReactNode } from 'react';
import { StyleSheet, Text, View, type TextStyle } from 'react-native';

import type { TextSpan } from '../../../lib/briefs-api';
import { colorRuns, OVERLAY_TEXT_SPEC, overlayTextContrast } from '../../../lib/overlay-boxes';
import { color, type as typeToken } from '../../../theme/tokens';
import { OutlinedText } from '../../ui/OutlinedText';
import { OutlinedRuns, spanNodes } from '../../ui/OverlayTextBox';
import type { ResolvedTextStyle } from './canvas/layout';

/** The slide font: the system heavy face at TikTok's size, line height and tracking. */
export function slideTextStyle(ts: ResolvedTextStyle, fs: number): TextStyle {
  return {
    fontFamily: typeToken.font.display,
    fontWeight: '800',
    fontSize: fs,
    lineHeight: Math.round(fs * 1.2),
    letterSpacing: -0.3,
    textAlign: ts.align,
  };
}

/** Letter color for the style: on a box the chosen color, else the text color. */
export function textInkFor(ts: ResolvedTextStyle): string {
  if (ts.bg !== 'box') return ts.color;
  return ts.color === ts.boxColor ? overlayTextContrast(ts.boxColor) : ts.color;
}

function alignSelfOf(align: ResolvedTextStyle['align']): 'flex-start' | 'center' | 'flex-end' {
  return align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center';
}

export function SlideText({
  text,
  ts,
  fs,
  maxWidth,
  spans,
  children,
}: {
  text: string;
  ts: ResolvedTextStyle;
  fs: number;
  /** Per word colors; chars outside every span use the box's letter color. */
  spans?: TextSpan[];
  /** Widest the box may wrap, in px. */
  maxWidth?: number;
  /** An editing TextInput sharing the same metrics. */
  children?: ReactNode;
}) {
  const spec = OVERLAY_TEXT_SPEC.bubble;
  const box = ts.bg === 'box';
  const padX = box ? fs * spec.padX : 0;
  const padY = box ? fs * spec.padY : 0;
  const ink = textInkFor(ts);
  const style = slideTextStyle(ts, fs);
  const colored = Boolean(spans?.length);

  if (children !== undefined) {
    // With per word colors the input's own letters are transparent (see
    // slideInputInk) and the colored runs are drawn under it at the same
    // metrics, the way SSCanvas layers a transparent textarea over spans.
    return (
      <View style={{ alignSelf: alignSelfOf(ts.align), maxWidth }}>
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <View style={[styles.fill, { backgroundColor: box ? ts.boxColor : 'transparent', borderRadius: fs * spec.radius }]} />
        </View>
        {colored ? (
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { paddingHorizontal: padX, paddingVertical: padY }]}>
            <Text style={[style, { color: ink }]}>{spanNodes(text, spans, ink)}</Text>
          </View>
        ) : null}
        <View style={{ paddingHorizontal: padX, paddingVertical: padY }}>{children}</View>
      </View>
    );
  }

  if (ts.bg === 'none') {
    return (
      <View style={{ alignSelf: alignSelfOf(ts.align), maxWidth }}>
        <Text style={[style, styles.plain, { color: ts.color }]}>{spanNodes(text, spans, ts.color)}</Text>
      </View>
    );
  }

  if (ts.bg === 'outline') {
    return (
      <View style={{ alignSelf: alignSelfOf(ts.align), maxWidth }}>
        {colored ? (
          <OutlinedRuns runs={colorRuns(text, spans, ts.color)} fontSize={fs} style={style} />
        ) : (
          <OutlinedText text={text} fontSize={fs} color={ts.color} style={style} />
        )}
      </View>
    );
  }

  return (
    <View style={{ alignSelf: alignSelfOf(ts.align), maxWidth }}>
      <View style={[styles.box, { backgroundColor: ts.boxColor, borderRadius: fs * spec.radius, paddingHorizontal: padX, paddingVertical: padY }]}>
        <Text style={[style, { color: ink }]}>{spanNodes(text, spans, ink)}</Text>
      </View>
    </View>
  );
}

/** Letter color of the editing input: transparent over colored runs. */
export function slideInputInk(ts: ResolvedTextStyle, spans: TextSpan[] | undefined): string {
  return spans?.length ? 'transparent' : textInkFor(ts);
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  box: {
    shadowColor: color.ink,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 4,
    shadowOpacity: 0.18,
  },
  plain: {
    textShadowColor: color.scrim,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 10,
  },
});
