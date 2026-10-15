// A movable thing on the slide (SSCanvas.jsx TextBoxView and PicSticker):
// drag to move, pinch to resize, tap without moving to edit. Positions are
// fractions of the frame; the parent owns them. Dragging and pinching run on
// the UI thread through shared values and commit once, on release, so the
// box follows the finger without a React render per frame.

import { useEffect, type ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, type SharedValue } from 'react-native-reanimated';

import { color } from '../../../../theme/tokens';

/** Snap distance as a fraction of the frame (SSCanvas SNAP). */
const SNAP = 0.018;

/**
 * Guide lines shared by every sticker on a canvas: -1 hides a line. `active`
 * is 1 while a sticker is being dragged or pinched, so the canvas can show
 * the platform safe zones only then.
 */
export type Guides = { x: SharedValue<number>; y: SharedValue<number>; active?: SharedValue<number> };

const CENTER: readonly number[] = [0.5];

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
  snapX = CENTER,
  snapY = CENTER,
  guides,
  children,
}: {
  x: number;
  y: number;
  width: number;
  W: number;
  H: number;
  hit?: boolean;
  align?: 'left' | 'center' | 'right';
  /** Total drag as fractions of the frame, once per release. */
  onMove: (dx: number, dy: number) => void;
  /** Total pinch ratio, once per release. */
  onScale: (ratio: number) => void;
  onTap?: () => void;
  onDrop?: () => void;
  snapX?: readonly number[];
  snapY?: readonly number[];
  guides?: Guides;
  children: ReactNode;
}) {
  const px = useSharedValue(x * W);
  const py = useSharedValue(y * H);
  const scale = useSharedValue(1);
  const h = useSharedValue(0);

  // The parent re-renders with the committed position; snap the shared values
  // to it so there is no frame where both the old offset and new props apply.
  useEffect(() => {
    px.set(x * W);
    py.set(y * H);
    scale.set(1);
  }, [x, y, W, H, width, px, py, scale]);

  // The finger's true position. Snapping only moves what is drawn; adding
  // each frame's delta to the snapped spot kept the box stuck on a guide.
  const rawX = useSharedValue(0);
  const rawY = useSharedValue(0);

  const pan = Gesture.Pan()
    .minDistance(2)
    .onStart(() => {
      rawX.set(px.get());
      rawY.set(py.get());
      guides?.active?.set(1);
    })
    .onChange((e) => {
      rawX.set(rawX.get() + e.changeX);
      rawY.set(rawY.get() + e.changeY);
      let nx = rawX.get();
      let ny = rawY.get();
      let gx = -1;
      let gy = -1;
      for (const v of snapX) {
        if (Math.abs(nx / W - v) < SNAP) {
          nx = v * W;
          gx = v;
          break;
        }
      }
      for (const v of snapY) {
        if (Math.abs(ny / H - v) < SNAP) {
          ny = v * H;
          gy = v;
          break;
        }
      }
      px.set(nx);
      py.set(ny);
      if (guides) {
        guides.x.set(gx);
        guides.y.set(gy);
      }
    })
    .onEnd(() => {
      if (guides) {
        guides.x.set(-1);
        guides.y.set(-1);
      }
      const dx = px.get() / W - x;
      const dy = py.get() / H - y;
      runOnJS(onMove)(dx, dy);
      if (onDrop) runOnJS(onDrop)();
    })
    .onFinalize(() => {
      guides?.active?.set(0);
    });
  const pinch = Gesture.Pinch()
    .onStart(() => {
      guides?.active?.set(1);
    })
    .onChange((e) => {
      scale.set(scale.get() * e.scaleChange);
    })
    .onEnd(() => {
      runOnJS(onScale)(scale.get());
    })
    .onFinalize(() => {
      guides?.active?.set(0);
    });
  const tap = Gesture.Tap().onEnd(() => {
    if (onTap) runOnJS(onTap)();
  });
  const gesture = Gesture.Race(Gesture.Simultaneous(pan, pinch), tap);

  const style = useAnimatedStyle(() => ({
    left: px.get() - width / 2,
    top: py.get() - h.get() / 2,
    opacity: h.get() ? 1 : 0,
    transform: [{ scale: scale.get() }],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        onLayout={(e) => {
          h.set(e.nativeEvent.layout.height);
        }}
        style={[
          styles.box,
          { width, alignItems: align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center' },
          style,
        ]}
      >
        {children}
        {hit ? <Animated.View pointerEvents="none" style={styles.hit} /> : null}
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  box: { position: 'absolute', borderRadius: 8 },
  hit: { position: 'absolute', top: -6, left: -6, right: -6, bottom: -6, borderRadius: 8, borderWidth: 1.5, borderStyle: 'dashed', borderColor: color.danger },
});
