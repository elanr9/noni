// Gradient fill drawn with react-native-svg, same props as the common
// LinearGradient API (colors, locations, start, end, style). start and end are
// fractions of the box, so the gradient stretches with the view.

import { useState, type ReactNode } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Rect, Stop } from 'react-native-svg';

export type GradientStops = readonly [string, string, ...string[]];

export interface GradientFillProps {
  colors: GradientStops;
  locations?: readonly number[];
  start?: { x: number; y: number };
  end?: { x: number; y: number };
  style?: StyleProp<ViewStyle>;
  pointerEvents?: 'none' | 'auto' | 'box-none' | 'box-only';
  children?: ReactNode;
}

let nextId = 0;

export function GradientFill({
  colors,
  locations,
  start = { x: 0, y: 0 },
  end = { x: 0, y: 1 },
  style,
  pointerEvents,
  children,
}: GradientFillProps) {
  const [id] = useState(() => `gf${(nextId += 1)}`);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width !== size.w || height !== size.h) setSize({ w: width, h: height });
  };
  const stops = colors.map((c, i) => {
    const offset = locations?.[i] ?? (colors.length === 1 ? 0 : i / (colors.length - 1));
    const transparent = c === 'transparent';
    return <Stop key={`${i}-${c}`} offset={offset} stopColor={transparent ? '#000000' : c} stopOpacity={transparent ? 0 : 1} />;
  });
  return (
    <View style={style} pointerEvents={pointerEvents} onLayout={onLayout}>
      {size.w > 0 && size.h > 0 ? (
        <Svg width={size.w} height={size.h} style={StyleSheet.absoluteFill} pointerEvents="none">
          <Defs>
            <SvgLinearGradient id={id} x1={start.x} y1={start.y} x2={end.x} y2={end.y}>
              {stops}
            </SvgLinearGradient>
          </Defs>
          <Rect x={0} y={0} width={size.w} height={size.h} fill={`url(#${id})`} />
        </Svg>
      ) : null}
      {children}
    </View>
  );
}
