// TikTok's default caption look: condensed white letters with a solid black
// stroke drawn fully outside the glyph. React Native has no text stroke, so
// copies in the stroke color sit one stroke width behind the text, spread
// evenly around a circle so curves stay smooth. The top element defines the
// layout; pass children to swap it for a TextInput that shares the style.
import type { JSX, ReactNode } from 'react';
import {
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
} from 'react-native';

import { classicOutlineColor, OVERLAY_TEXT_SPEC } from '../../lib/overlay-boxes';

const OFFSET_COUNT = 16;

const OFFSETS: readonly (readonly [number, number])[] = Array.from(
  { length: OFFSET_COUNT },
  (_, i) => {
    const angle = (i / OFFSET_COUNT) * Math.PI * 2;
    return [Math.cos(angle), Math.sin(angle)] as const;
  },
);

export function OutlinedText(props: {
  text: string;
  fontSize: number;
  color: string;
  style?: StyleProp<TextStyle>;
  children?: ReactNode;
}): JSX.Element {
  const { text, fontSize, color, style, children } = props;
  const stroke = fontSize * OVERLAY_TEXT_SPEC.condensed.strokeRatio;
  const outline = classicOutlineColor(color);
  return (
    <View>
      {OFFSETS.map(([dx, dy], i) => (
        <Text
          key={i}
          pointerEvents="none"
          style={[
            styles.base,
            style,
            styles.layer,
            {
              fontSize,
              color: outline,
              transform: [{ translateX: dx * stroke }, { translateY: dy * stroke }],
            },
          ]}
        >
          {text}
        </Text>
      ))}
      {children ?? (
        <Text style={[styles.base, style, { fontSize, color }]}>{text}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    fontFamily: OVERLAY_TEXT_SPEC.condensed.fontFamily,
    fontWeight: OVERLAY_TEXT_SPEC.condensed.fontWeight,
  },
  layer: {
    ...StyleSheet.absoluteFill,
  },
});
