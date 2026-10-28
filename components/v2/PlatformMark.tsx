import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { color } from '../../theme/v2';

/** TikTok glyph. */
export function TikTokMark({ size = 16, color: fill = color.white }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={fill}>
      <Path d="M16.6 5.82A4.28 4.28 0 0 1 15.54 3h-3.09v12.4a2.59 2.59 0 0 1-2.59 2.5 2.6 2.6 0 0 1-2.6-2.6 2.6 2.6 0 0 1 3.4-2.47V9.66a5.7 5.7 0 0 0-.8-.06 5.73 5.73 0 1 0 5.73 5.73V9.01a7.35 7.35 0 0 0 4.3 1.38V7.3a4.3 4.3 0 0 1-3.29-1.48z" />
    </Svg>
  );
}

/** Instagram camera glyph. */
export function InstagramMark({ size = 16, color: stroke = color.white, strokeWidth = 2.2 }: { size?: number; color?: string; strokeWidth?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={strokeWidth}>
      <Rect x={3} y={3} width={18} height={18} rx={5} />
      <Circle cx={12} cy={12} r={4} />
      <Circle cx={17.5} cy={6.5} r={1} fill={stroke} stroke="none" />
    </Svg>
  );
}

export const IG_GRADIENT = ['#F9CE34', '#EE2A7B', '#6228D7'] as const;

/** Instagram brand gradient (45deg) behind `children`, clipped to `radius`. */
export function InstagramFill({ children, radius = 999, style }: { children?: ReactNode; radius?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ overflow: 'hidden', borderRadius: radius }, style]}>
      <Svg width="100%" height="100%" style={{ position: 'absolute', top: 0, left: 0 }} preserveAspectRatio="none" viewBox="0 0 1 1">
        <Defs>
          <LinearGradient id="ig" x1="0" y1="1" x2="1" y2="0">
            <Stop offset="0" stopColor={IG_GRADIENT[0]} />
            <Stop offset="0.5" stopColor={IG_GRADIENT[1]} />
            <Stop offset="1" stopColor={IG_GRADIENT[2]} />
          </LinearGradient>
        </Defs>
        <Rect width={1} height={1} fill="url(#ig)" />
      </Svg>
      {children}
    </View>
  );
}
