// One stage item's gestures: drag to move, pinch to resize, tap, long press.
// Position and scale live in shared values on the UI thread; the document is
// written once on release through the callbacks.
// Shared values are mutated inside gesture worklets built during render,
// which the React Compiler rules read as ref writes; that is the documented
// Reanimated pattern.
/* eslint-disable react-hooks/refs, react-hooks/immutability */
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { Gesture, type ComposedGesture } from 'react-native-gesture-handler';
import {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  type AnimatedStyle,
} from 'react-native-reanimated';
import type { ViewStyle } from 'react-native';

import { clampCenter, clampValue, snapCenterX, snapRatio } from './geometry';
import { beginGesture, endGesture } from './overlay-actions';

const TAP_SLOP_PX = 4;
const TAP_MAX_MS = 350;
const LONG_PRESS_MS = 500;

export type StageGestureParams = {
  x: number;
  y: number;
  /** Rendered size; a change settles the live scale back to 1. */
  size: number;
  stageWidth: number;
  stageHeight: number;
  minRatio: number;
  maxRatio: number;
  onMove: (x: number, y: number) => void;
  onScale: (ratio: number, x: number, y: number) => void;
  onTap: () => void;
  onLongPress: () => void;
};

export type StageGesture = {
  gesture: ComposedGesture;
  itemStyle: AnimatedStyle<ViewStyle>;
  guideStyle: AnimatedStyle<ViewStyle>;
  dragOutlineStyle: AnimatedStyle<ViewStyle>;
};

export function useStageGesture(params: StageGestureParams): StageGesture {
  const { x, y, size, stageWidth, stageHeight, minRatio, maxRatio } = params;
  const latest = useRef(params);
  useLayoutEffect(() => {
    latest.current = params;
  });

  const liveX = useSharedValue(x);
  const liveY = useSharedValue(y);
  const scale = useSharedValue(1);
  const guide = useSharedValue(0);
  const activeCount = useSharedValue(0);
  const startX = useSharedValue(x);
  const startY = useSharedValue(y);
  const startScale = useSharedValue(1);

  useEffect(() => {
    if (activeCount.value > 0) return;
    liveX.value = x;
    liveY.value = y;
    scale.value = 1;
  }, [x, y, size, stageWidth, stageHeight, liveX, liveY, scale, activeCount]);

  const begin = useCallback(() => beginGesture(), []);
  const move = useCallback((nx: number, ny: number) => {
    const p = latest.current;
    if (nx === p.x && ny === p.y) endGesture();
    else p.onMove(nx, ny);
  }, []);
  const resize = useCallback((ratio: number, nx: number, ny: number) => {
    if (ratio === 1) endGesture();
    else latest.current.onScale(ratio, nx, ny);
  }, []);
  const tap = useCallback(() => latest.current.onTap(), []);
  const hold = useCallback(() => latest.current.onLongPress(), []);

  const pan = Gesture.Pan()
    .minDistance(TAP_SLOP_PX)
    .onStart(() => {
      activeCount.value += 1;
      startX.value = liveX.value;
      startY.value = liveY.value;
      runOnJS(begin)();
    })
    .onUpdate((e) => {
      if (stageWidth <= 0 || stageHeight <= 0) return;
      const c = clampCenter(
        startX.value + e.translationX / stageWidth,
        startY.value + e.translationY / stageHeight,
      );
      const nx = snapCenterX(c.x);
      guide.value = nx === 0.5 ? 1 : 0;
      liveX.value = nx;
      liveY.value = c.y;
    })
    .onEnd(() => {
      activeCount.value -= 1;
      guide.value = 0;
      runOnJS(move)(liveX.value, liveY.value);
    });

  const pinch = Gesture.Pinch()
    .onStart(() => {
      activeCount.value += 1;
      startScale.value = scale.value;
      runOnJS(begin)();
    })
    .onUpdate((e) => {
      scale.value = clampValue(snapRatio(startScale.value * e.scale), minRatio, maxRatio);
    })
    .onEnd(() => {
      activeCount.value -= 1;
      runOnJS(resize)(scale.value, liveX.value, liveY.value);
    });

  const tapGesture = Gesture.Tap()
    .maxDuration(TAP_MAX_MS)
    .maxDistance(TAP_SLOP_PX * 2)
    .onEnd((_e, success) => {
      if (success) runOnJS(tap)();
    });

  const longPress = Gesture.LongPress()
    .minDuration(LONG_PRESS_MS)
    .maxDistance(TAP_SLOP_PX * 2)
    .onStart(() => {
      runOnJS(hold)();
    });

  const gesture = Gesture.Race(
    Gesture.Simultaneous(pan, pinch),
    Gesture.Exclusive(longPress, tapGesture),
  );

  const itemStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: (liveX.value - 0.5) * stageWidth },
      { translateY: (liveY.value - 0.5) * stageHeight },
      { scale: scale.value },
    ],
  }));
  const guideStyle = useAnimatedStyle(() => ({ opacity: guide.value }));
  const dragOutlineStyle = useAnimatedStyle(() => ({ opacity: activeCount.value > 0 ? 1 : 0 }));

  return { gesture, itemStyle, guideStyle, dragOutlineStyle };
}
