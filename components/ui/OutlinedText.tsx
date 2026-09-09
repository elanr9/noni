// TikTok's classic caption look: white bold letters with a thin black
// outline. React Native has no text stroke, so eight black copies sit one
// stroke width behind the white text. The top element defines the layout;
// pass children to swap it for a TextInput that shares the same style.
import type { JSX, ReactNode } from 'react';
import {
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
} from 'react-native';

/** Outline thickness as a fraction of the font size, matching the render pass. */
export const OUTLINE_RATIO = 0.06;

const OFFSETS: readonly (readonly [number, number])[] = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
];

export function OutlinedText(props: {
  text: string;
  fontSize: number;
  color: string;
  style?: StyleProp<TextStyle>;
  children?: ReactNode;
}): JSX.Element {
  const { text, fontSize, color, style, children } = props;
  const stroke = fontSize * OUTLINE_RATIO;
  return (
    <View>
      {OFFSETS.map(([dx, dy]) => (
        <Text
          key={`${dx},${dy}`}
          pointerEvents="none"
          style={[
            style,
            styles.layer,
            {
              fontSize,
              transform: [{ translateX: dx * stroke }, { translateY: dy * stroke }],
            },
          ]}
        >
          {text}
        </Text>
      ))}
      {children ?? <Text style={[style, { fontSize, color }]}>{text}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFill,
    color: '#000000',
    textShadowColor: 'rgba(0,0,0,0.18)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
});
