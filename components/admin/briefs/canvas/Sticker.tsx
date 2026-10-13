// A movable thing on the slide (SSCanvas.jsx TextBoxView and PicSticker):
// drag to move, pinch to resize, tap without moving to edit. Positions are
// fractions of the frame; the parent owns them.

import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';

import { color } from '../../../../theme/tokens';

export function Sticker({
  x,
  y,
  width,
  W,
  H,
  hit = false,
  align = 'center',
  onMove,
  onScale,
  onTap,
  onDrop,
  children,
}: {
  x: number;
  y: number;
  width: number;
  W: number;
  H: number;
  hit?: boolean;
  align?: 'left' | 'center' | 'right';
  onMove: (dx: number, dy: number) => void;
  onScale: (ratio: number) => void;
  onTap?: () => void;
  onDrop?: () => void;
  children: ReactNode;
}) {
  const [h, setH] = useState(0);

  const pan = Gesture.Pan()
    .minDistance(2)
    .onChange((e) => {
      runOnJS(onMove)(e.changeX / W, e.changeY / H);
    })
    .onEnd(() => {
      if (onDrop) runOnJS(onDrop)();
    });
  const pinch = Gesture.Pinch().onChange((e) => {
    runOnJS(onScale)(e.scaleChange);
  });
  const tap = Gesture.Tap().onEnd(() => {
    if (onTap) runOnJS(onTap)();
  });
  const gesture = Gesture.Race(Gesture.Simultaneous(pan, pinch), tap);

  return (
    <GestureDetector gesture={gesture}>
      <View
        onLayout={(e) => setH(e.nativeEvent.layout.height)}
        style={[
          styles.box,
          {
            left: x * W - width / 2,
            top: y * H - h / 2,
            width,
            alignItems: align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center',
            opacity: h ? 1 : 0,
          },
        ]}
      >
        {children}
        {hit ? <View pointerEvents="none" style={styles.hit} /> : null}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  box: { position: 'absolute', borderRadius: 8 },
  hit: { position: 'absolute', top: -6, left: -6, right: -6, bottom: -6, borderRadius: 8, borderWidth: 1.5, borderStyle: 'dashed', borderColor: color.danger },
});
