// Vertical gradient drawn as stacked bands, because the app has no gradient
// dependency. Colors come from theme tokens; this only interpolates them.

import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}

function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `rgb(${r},${g},${bl})`;
}

/** Color at position t (0 to 1) along evenly spaced stops. */
export function gradientAt(stops: readonly string[], t: number): string {
  if (stops.length === 1) return stops[0];
  const seg = 1 / (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(t / seg));
  return mix(stops[i], stops[i + 1], (t - i * seg) / seg);
}

export function GradientFill({
  stops,
  bands = 14,
  style,
}: {
  stops: readonly string[];
  bands?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      {Array.from({ length: bands }).map((_, i) => (
        <View key={i} style={{ flex: 1, backgroundColor: gradientAt(stops, i / Math.max(1, bands - 1)) }} />
      ))}
    </View>
  );
}
