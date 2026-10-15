// One on-screen text box drawn the way TikTok's text tool draws it. Bare
// text is condensed white letters with a black stroke; text with background
// is one merged blob of per line bubbles (lib/overlay-bubble-path). Lines are
// wrapped with the font's own advance widths (lib/overlay-text-metrics) so
// the render breaks in the same places.
import type { JSX, ReactNode } from 'react';
import { Dimensions, StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import {
  classicOutlineColor,
  colorRuns,
  lineColorRuns,
  OVERLAY_TEXT_SPEC,
  overlayBoxFill,
  overlayTextContrast,
  type ColorRun,
  type ColorSpan,
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

/**
 * Per word colors as nested <Text>: one child per run. Pass `ink` to map each
 * run color (the outline copies draw every run in its outline color).
 */
export function runNodes(runs: readonly ColorRun[], ink: (c: string) => string = (c) => c): ReactNode[] {
  return runs.map((r) => (
    <Text key={r.start} style={{ color: ink(r.color) }}>
      {r.text}
    </Text>
  ));
}

/** The text with its color spans as nested runs; plain text when there are none. */
export function spanNodes(text: string, spans: readonly ColorSpan[] | undefined, base: string): ReactNode {
  if (!spans?.length) return text;
  return runNodes(colorRuns(text, spans, base));
}

const OUTLINE_OFFSETS: readonly (readonly [number, number])[] = Array.from({ length: 16 }, (_, i) => {
  const angle = (i / 16) * Math.PI * 2;
  return [Math.cos(angle), Math.sin(angle)] as const;
});

/**
 * OutlinedText with color runs: each run gets its own outline color, so a
 * black word on white text keeps a white stroke the way TikTok draws it.
 */
export function OutlinedRuns(props: {
  runs: readonly ColorRun[];
  fontSize: number;
  style?: StyleProp<TextStyle>;
  children?: ReactNode;
}): JSX.Element {
  const { runs, fontSize, style, children } = props;
  const stroke = fontSize * OVERLAY_TEXT_SPEC.condensed.strokeRatio;
  return (
    <View>
      {OUTLINE_OFFSETS.map(([dx, dy], i) => (
        <Text
          key={i}
          pointerEvents="none"
          style={[styles.outlineBase, style, styles.outlineLayer, { fontSize, transform: [{ translateX: dx * stroke }, { translateY: dy * stroke }] }]}
        >
          {runNodes(runs, classicOutlineColor)}
        </Text>
      ))}
      {children ?? <Text style={[styles.outlineBase, style, { fontSize }]}>{runNodes(runs)}</Text>}
    </View>
  );
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
  /** Box fill override; by default derived from color the way TikTok tints it. */
  fill?: string;
  /** Letter color override on a box; by default the contrast ink for the fill. */
  textColor?: string;
  /** Per word colors (chars [start, end) of text); the rest uses the box color. */
  spans?: ColorSpan[];
}): JSX.Element {
  const { text, color, bg, fontSize, maxWidth, children, spans } = props;

  const boxWidth =
    maxWidth ?? Dimensions.get('window').width * OVERLAY_TEXT_SPEC.maxWidth;
  const textStyle = overlayTextStyle(fontSize, bg);

  if (!bg) {
    const lines = wrapOverlayLines(text, boxWidth / fontSize, 'condensed');
    if (spans?.length && children === undefined) {
      const runs = lineColorRuns(text, lines, spans, color).flatMap((line, i) =>
        i === 0 ? line : [{ text: '\n', color, start: -i }, ...line],
      );
      return (
        <View style={{ maxWidth: boxWidth }}>
          <OutlinedRuns runs={runs} fontSize={fontSize} style={textStyle} />
        </View>
      );
    }
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
  const fill = props.fill ?? overlayBoxFill(color);
  const ink = props.textColor ?? overlayTextContrast(props.fill ?? color);

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
  const lineRuns = spans?.length ? lineColorRuns(text, lines, spans, ink) : null;
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
            {line.length === 0 ? ' ' : lineRuns ? runNodes(lineRuns[i]) : line}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outlineBase: {
    fontFamily: OVERLAY_TEXT_SPEC.condensed.fontFamily,
    fontWeight: OVERLAY_TEXT_SPEC.condensed.fontWeight,
  },
  outlineLayer: {
    ...StyleSheet.absoluteFill,
  },
  lines: {
    alignItems: 'center',
  },
});
