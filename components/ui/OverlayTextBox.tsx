// One on-screen text box drawn the way TikTok's text tool draws it. Classic
// is outlined letters; a colored box gives every wrapped line its own bubble
// hugging that line, stacked with no gap. Lines are measured off a hidden
// copy of the text so bubble widths match the real wrap.
import { useState, type JSX, type ReactNode } from 'react';
import {
  Dimensions,
  StyleSheet,
  Text,
  View,
  type TextLayoutLine,
  type TextStyle,
} from 'react-native';

import {
  OVERLAY_TEXT_SPEC,
  overlayBoxFill,
  overlayTextContrast,
} from '../../lib/overlay-boxes';
import { OutlinedText } from './OutlinedText';

type MeasuredLines = { key: string; lines: TextLayoutLine[] };

/** Rows whose widths differ by less than this read as one rectangle. */
const JOIN_TOLERANCE_EM = 0.35;

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
  const [measured, setMeasured] = useState<MeasuredLines | null>(null);

  const padX = fontSize * OVERLAY_TEXT_SPEC.boxPadX;
  const padY = fontSize * OVERLAY_TEXT_SPEC.boxPadY;
  const radius = fontSize * OVERLAY_TEXT_SPEC.boxRadius;
  const boxWidth =
    maxWidth ?? Dimensions.get('window').width * OVERLAY_TEXT_SPEC.maxWidth;
  const wrapWidth = Math.max(0, boxWidth - 2 * padX);
  const textStyle = overlayTextStyle(fontSize, fontLoaded);

  if (!bg) {
    return (
      <View style={{ maxWidth: boxWidth }}>
        <OutlinedText text={text} fontSize={fontSize} color={color} style={textStyle}>
          {children}
        </OutlinedText>
      </View>
    );
  }

  const fill = overlayBoxFill(color);
  const ink = overlayTextContrast(color);
  const measureKey = `${text}|${fontSize}|${wrapWidth}`;
  const lines =
    children === undefined && measured !== null && measured.key === measureKey
      ? measured.lines
      : null;

  if (lines === null) {
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
          {children ?? <Text style={[textStyle, { color: ink }]}>{text}</Text>}
        </View>
        {children === undefined ? (
          <Text
            pointerEvents="none"
            style={[styles.measure, textStyle, { width: wrapWidth }]}
            onTextLayout={(e) =>
              setMeasured({ key: measureKey, lines: e.nativeEvent.lines })
            }
          >
            {text}
          </Text>
        ) : null}
      </View>
    );
  }

  const tolerance = fontSize * JOIN_TOLERANCE_EM;
  const rowWidths = lines.map((l) => l.width + 2 * padX);
  const joins = (a: number | undefined, b: number): boolean =>
    a !== undefined && a >= b - tolerance;
  const blank = (l: TextLayoutLine): boolean => l.text.trim().length === 0;

  return (
    <View style={[styles.stack, { maxWidth: boxWidth }]}>
      {lines.map((line, i) => {
        if (blank(line)) {
          return <View key={i} style={{ height: line.height }} />;
        }
        const width = rowWidths[i] ?? 0;
        const prev = lines[i - 1];
        const next = lines[i + 1];
        const joinTop = prev !== undefined && !blank(prev) && joins(rowWidths[i - 1], width);
        const joinBottom =
          next !== undefined && !blank(next) && joins(rowWidths[i + 1], width);
        return (
          <View
            key={i}
            style={{
              backgroundColor: fill,
              paddingHorizontal: padX,
              paddingTop: i === 0 ? padY : 0,
              paddingBottom: i === lines.length - 1 ? padY : 0,
              borderTopLeftRadius: joinTop ? 0 : radius,
              borderTopRightRadius: joinTop ? 0 : radius,
              borderBottomLeftRadius: joinBottom ? 0 : radius,
              borderBottomRightRadius: joinBottom ? 0 : radius,
            }}
          >
            <Text style={[textStyle, { color: ink }]}>{line.text.trimEnd()}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    alignItems: 'center',
  },
  measure: {
    position: 'absolute',
    top: 0,
    left: 0,
    opacity: 0,
  },
});
