import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Path } from 'react-native-svg';

import { color } from '../../theme/tokens';

/** Flat marlin mark from Claude design handoff. One blue, no gradients. */
export function BubbleMark({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120" fill="none">
      <G fill={color.accent}>
        <Path d="M36 90L8 74c6 10 9 18 9 25 0 7-2 14-6 21L36 90z" />
        <Path d="M44 72C44 48 50 28 58 18c8 12 12 28 12 42z" />
        <G stroke={color.white} strokeWidth={2.4} strokeLinecap="round" fill="none">
          <Path d="M50 64c0-16 2-28 6-36" />
          <Path d="M57 63c1-13 3-23 6-30" />
          <Path d="M64 63c2-10 3-17 5-22" />
        </G>
        <Path d="M30 96C26 76 40 54 60 41c10-6 20-10 28-11l26-18-19 27c-1 8-6 17-15 26C68 78 48 94 30 96z" />
        <Path d="M60 68c8-1 15 3 19 9-8 3-17 1-23-4z" />
        <Circle cx={80} cy={38} r={3} fill={color.white} />
      </G>
    </Svg>
  );
}

export function Wordmark({ size = 19 }: { size?: number }) {
  return (
    <View style={[styles.row, { gap: size * 0.26 }]}>
      <BubbleMark size={size * 1.55} />
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
  },
});
