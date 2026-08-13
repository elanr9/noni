import { StyleSheet, Text, View } from 'react-native';
import Svg, { G, Path } from 'react-native-svg';

import { color } from '../../theme/tokens';

/** Solid rocket mark. Window is a cutout. Do not restroke or recolor. */
export function BubbleMark({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 160 160" fill="none">
      <G transform="rotate(45 80 80) translate(20 2)">
        <Path
          fillRule="evenodd"
          fill={color.blue300}
          d="M60 8C78 28 85 54 85 80L85 104 35 104 35 80C35 54 42 28 60 8ZM74 58a14 14 0 1 1-28 0a14 14 0 1 1 28 0Z"
        />
        <Path d="M35 76C22 86 17 100 17 114L37 102Z" fill={color.blue300} />
        <Path d="M85 76C98 86 103 100 103 114L83 102Z" fill={color.blue300} />
        <G stroke={color.blue300} strokeWidth={11} strokeLinecap="round" fill="none">
          <Path d="M60 122L60 144" />
          <Path d="M42 118L38 132" />
          <Path d="M78 118L82 132" />
        </G>
      </G>
    </Svg>
  );
}

export function Wordmark({ size = 19 }: { size?: number }) {
  return (
    <View style={[styles.row, { gap: size * (10 / 34) }]}>
      <BubbleMark size={size} />
      <Text style={[styles.text, { fontSize: size }]}>noni</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  text: {
    fontWeight: '800',
    color: color.ink,
    textTransform: 'lowercase',
    letterSpacing: -0.5,
  },
});
