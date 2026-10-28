import { Text, View, type StyleProp, type ViewStyle } from 'react-native';

import type { StText } from '../../lib/brief-library';
import { stRender } from '../../lib/st-text';

/**
 * One on-screen text placed in a frame of `width` x `height` (percent coordinates,
 * centred on x,y). Outline styles draw the stroke as offset copies under the fill.
 */
export function StTextView({ x, width, height, style }: { x: StText; width: number; height: number; style?: StyleProp<ViewStyle> }) {
  const scale = width / 300;
  const r = stRender(x, scale);
  const w = ((x.w || 70) / 100) * width;
  const offsets = r.strokeColor
    ? [
        [-1, 0], [1, 0], [0, -1], [0, 1],
        [-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7],
      ]
    : [];
  const sw = Math.max(0.5, r.strokeWidth * 0.5);
  return (
    <View
      pointerEvents="none"
      style={[
        { position: 'absolute', left: (x.x / 100) * width - w / 2, top: (x.y / 100) * height, width: w, alignItems: x.align === 'left' ? 'flex-start' : x.align === 'right' ? 'flex-end' : 'center', transform: [{ translateY: -(r.text.lineHeight ?? 0) / 2 }] },
        style,
      ]}
    >
      <View style={[r.box, { alignSelf: x.align === 'left' ? 'flex-start' : x.align === 'right' ? 'flex-end' : 'center' }]}>
        {offsets.map(([dx, dy], i) => (
          <Text key={i} allowFontScaling={false} style={[r.text, { position: 'absolute', left: (r.box.paddingHorizontal ?? 0) + dx * sw, top: (r.box.paddingVertical ?? 0) + dy * sw, color: r.strokeColor ?? undefined, textShadowColor: 'transparent' }]}>
            {x.text}
          </Text>
        ))}
        <Text allowFontScaling={false} style={r.text}>{x.text}</Text>
      </View>
    </View>
  );
}
