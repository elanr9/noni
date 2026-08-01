import { useId } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, G, LinearGradient, Path, Stop } from 'react-native-svg';

import { color } from '../../theme/tokens';

const SEGMENTS = ['M168 372V140', 'M344 372V140', 'M170 156L342 356'] as const;

/** The Noni bubble "N" mark (assets/logo.svg, gloss approximated by the top stroke only). */
export function BubbleMark({ size }: { size: number }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const bodyId = `noniBody${id}`;
  const rimId = `noniRim${id}`;

  return (
    <Svg width={size} height={size} viewBox="0 0 512 512">
      <Defs>
        <LinearGradient
          id={bodyId}
          gradientUnits="userSpaceOnUse"
          x1="120"
          y1="70"
          x2="420"
          y2="440"
        >
          <Stop offset="0" stopColor="#9AD4F9" />
          <Stop offset="0.36" stopColor="#4FB6F2" />
          <Stop offset="0.72" stopColor="#1189CC" />
          <Stop offset="1" stopColor="#08557F" />
        </LinearGradient>
        <LinearGradient
          id={rimId}
          gradientUnits="userSpaceOnUse"
          x1="256"
          y1="60"
          x2="256"
          y2="300"
        >
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.95" />
          <Stop offset="0.55" stopColor="#FFFFFF" stopOpacity="0.2" />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </LinearGradient>
      </Defs>
      {SEGMENTS.map((d) => (
        <Path
          key={d}
          d={d}
          stroke={`url(#${bodyId})`}
          strokeWidth={118}
          strokeLinecap="round"
          fill="none"
        />
      ))}
      <G transform="translate(-8,-40)">
        {SEGMENTS.map((d) => (
          <Path
            key={d}
            d={d}
            stroke={`url(#${rimId})`}
            strokeWidth={18}
            strokeLinecap="round"
            fill="none"
          />
        ))}
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
