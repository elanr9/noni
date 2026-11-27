// The box a creator scribbles their signature in. The drawing is kept as SVG
// path data in a 320 by 120 box (M/L commands only), which is what the server
// stores and the signed copy draws back.
import { useRef, useState } from 'react';
import { Text, View, type GestureResponderEvent } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { color, radius, text } from '../../theme/v2';
import { Press } from '../v2';

export const SIGNATURE_BOX = { width: 320, height: 120 };
const HEIGHT = 150;

/** A scribble counts once it has some length to it, not a single tap. */
export function isDrawn(path: string): boolean {
  return (path.match(/L/g) ?? []).length >= 8;
}

export function SignaturePad({ value, onChange, onDrawing }: { value: string; onChange: (path: string) => void; onDrawing?: (drawing: boolean) => void }) {
  const [width, setWidth] = useState(0);
  const origin = useRef({ x: 0, y: 0 });
  // Moves can arrive faster than renders, so the growing path is kept here too.
  const path = useRef(value);

  const point = (pageX: number, pageY: number) => {
    const x = Math.min(SIGNATURE_BOX.width, Math.max(0, ((pageX - origin.current.x) / (width || 1)) * SIGNATURE_BOX.width));
    const y = Math.min(SIGNATURE_BOX.height, Math.max(0, ((pageY - origin.current.y) / HEIGHT) * SIGNATURE_BOX.height));
    return `${Math.round(x * 10) / 10} ${Math.round(y * 10) / 10}`;
  };
  const push = (next: string) => {
    path.current = next;
    onChange(next);
  };
  const start = (e: GestureResponderEvent) => {
    const { pageX, pageY, locationX, locationY } = e.nativeEvent;
    origin.current = { x: pageX - locationX, y: pageY - locationY };
    onDrawing?.(true);
    push(`${path.current ? `${path.current} ` : ''}M${point(pageX, pageY)}`);
  };
  const move = (e: GestureResponderEvent) => push(`${path.current} L${point(e.nativeEvent.pageX, e.nativeEvent.pageY)}`);
  const end = () => onDrawing?.(false);

  return (
    <View style={{ marginBottom: 12 }}>
      <View
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={start}
        onResponderMove={move}
        onResponderRelease={end}
        onResponderTerminate={end}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        accessibilityLabel="Draw your signature"
        style={{ height: HEIGHT, borderRadius: radius.card, backgroundColor: color.card, borderWidth: 2, borderColor: value ? color.blue : color.grey2, overflow: 'hidden', justifyContent: 'center' }}
      >
        {value ? null : (
          <Text pointerEvents="none" style={[text.body, { color: color.grey3, textAlign: 'center' }]}>
            Sign here
          </Text>
        )}
        <View pointerEvents="none" style={{ position: 'absolute', left: 16, right: 16, bottom: 34, height: 1, backgroundColor: color.grey2 }} />
        <Svg pointerEvents="none" width="100%" height={HEIGHT} viewBox={`0 0 ${SIGNATURE_BOX.width} ${SIGNATURE_BOX.height}`} preserveAspectRatio="none" style={{ position: 'absolute', left: 0, top: 0 }}>
          <Path d={value || 'M0 0'} stroke={color.ink} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </Svg>
      </View>
      {value ? (
        <Press onPress={() => push('')} accessibilityRole="button" style={{ alignSelf: 'flex-end', paddingVertical: 8, paddingHorizontal: 4 }}>
          <Text style={[text.meta, { color: color.blue, fontWeight: '700' }]}>Clear</Text>
        </Press>
      ) : null}
    </View>
  );
}
