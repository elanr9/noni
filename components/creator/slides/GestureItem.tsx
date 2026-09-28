// One stage item (text box or inset) the creator can drag with one finger,
// pinch with two, or tap. Every visual during the gesture is an Animated
// value on the native side (transform and opacity only); React state is
// touched only on release, when the new position or scale is committed.
import { useEffect, useState, type JSX, type ReactNode } from 'react';
import {
  Animated,
  PanResponder,
  StyleSheet,
  View,
  type GestureResponderEvent,
  type PanResponderGestureState,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { color } from '../../../theme/tokens';
import { CENTER_SNAP, PLACE_EDGE, clamp } from './frame';

const TAP_MAX_MOVE = 6;
const TAP_MAX_MS = 350;
const LIFT_SCALE = 1.03;
const HIT_SLOP = 8;

type Touch = { pageX: number; pageY: number };

function touchDistance(touches: readonly Touch[]): number {
  const a = touches[0];
  const b = touches[1];
  if (a === undefined || b === undefined) return 0;
  return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
}

type ItemProps = {
  x: number;
  y: number;
  stageWidth: number;
  stageHeight: number;
  /** Fires on release with the new centre fractions. */
  onMove?: (x: number, y: number) => void;
  /** Fires on release with the pinch ratio, already clamped to min..max. */
  onScale?: (ratio: number) => void;
  minScale?: number;
  maxScale?: number;
  onTap?: () => void;
  onGestureStart?: () => void;
  selected?: boolean;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
};

function centerPx(p: ItemProps): { x: number; y: number } {
  return { x: (p.x - 0.5) * p.stageWidth, y: (p.y - 0.5) * p.stageHeight };
}

/** Moves the value onto the native animated thread so later setValue calls skip the bridge. */
function driveNatively(value: Animated.Value, current: number): void {
  Animated.timing(value, { toValue: current, duration: 0, useNativeDriver: true }).start();
}

/** Gesture state and the PanResponder, kept off React so props refresh freely. */
function createItemGesture(initial: ItemProps) {
  const start = centerPx(initial);
  const pan = new Animated.ValueXY(start);
  const scale = new Animated.Value(1);
  const guide = new Animated.Value(0);
  const lift = new Animated.Value(0);
  driveNatively(pan.x, start.x);
  driveNatively(pan.y, start.y);
  driveNatively(scale, 1);
  driveNatively(guide, 0);
  driveNatively(lift, 0);

  let props = initial;
  let origin = { x: initial.x, y: initial.y };
  let live = origin;
  let liveScale = 1;
  let pinchStart = 0;
  let pinching = false;
  let moved = false;
  let dragging = false;
  let snapped = false;
  let startedAt = 0;

  const rest = () => {
    const c = centerPx(props);
    pan.x.setValue(c.x);
    pan.y.setValue(c.y);
  };

  const setSnapped = (on: boolean) => {
    if (on === snapped) return;
    snapped = on;
    guide.setValue(on ? 1 : 0);
  };

  const springScale = (to: number) =>
    Animated.spring(scale, { toValue: to, useNativeDriver: true, speed: 40, bounciness: 4 }).start();

  const onGrant = () => {
    origin = { x: props.x, y: props.y };
    live = origin;
    liveScale = 1;
    pinchStart = 0;
    pinching = false;
    moved = false;
    dragging = true;
    startedAt = Date.now();
    props.onGestureStart?.();
    lift.setValue(1);
    springScale(LIFT_SCALE);
  };

  const onMove = (evt: GestureResponderEvent, gs: PanResponderGestureState) => {
    const w = props.stageWidth;
    const h = props.stageHeight;
    if (w <= 0 || h <= 0) return;
    const touches = evt.nativeEvent.touches;

    if (touches.length >= 2 && props.onScale !== undefined) {
      const dist = touchDistance(touches);
      if (pinchStart === 0) {
        pinchStart = dist;
        pinching = true;
        return;
      }
      if (dist <= 0) return;
      liveScale = clamp(dist / pinchStart, props.minScale ?? 1, props.maxScale ?? 1);
      scale.setValue(liveScale);
      return;
    }
    if (pinching || props.onMove === undefined) return;

    if (Math.abs(gs.dx) + Math.abs(gs.dy) > TAP_MAX_MOVE) moved = true;
    let nx = clamp(origin.x + gs.dx / w, PLACE_EDGE, 1 - PLACE_EDGE);
    const ny = clamp(origin.y + gs.dy / h, PLACE_EDGE, 1 - PLACE_EDGE);
    const onCenter = Math.abs(nx - 0.5) < CENTER_SNAP;
    if (onCenter) nx = 0.5;
    setSnapped(onCenter);
    live = { x: nx, y: ny };
    pan.x.setValue((nx - 0.5) * w);
    pan.y.setValue((ny - 0.5) * h);
  };

  const finish = () => {
    dragging = false;
    lift.setValue(0);
    setSnapped(false);
  };

  const onRelease = () => {
    finish();
    if (pinching) {
      scale.setValue(1);
      if (liveScale !== 1) props.onScale?.(liveScale);
      return;
    }
    springScale(1);
    if (moved) {
      if (live.x !== origin.x || live.y !== origin.y) props.onMove?.(live.x, live.y);
      return;
    }
    rest();
    if (Date.now() - startedAt < TAP_MAX_MS) props.onTap?.();
  };

  const onTerminate = () => {
    finish();
    scale.setValue(1);
    rest();
  };

  const responder = PanResponder.create({
    // Claim on touch start so the slide pager underneath can never take a
    // hold or drag that began on this item.
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: onGrant,
    onPanResponderMove: onMove,
    onPanResponderRelease: onRelease,
    onPanResponderTerminate: onTerminate,
  });

  return {
    pan,
    scale,
    guide,
    lift,
    panHandlers: responder.panHandlers,
    setProps(next: ItemProps) {
      props = next;
    },
    /** Snap the item to its stored position when nothing is being dragged. */
    settle() {
      if (!dragging) rest();
    },
  };
}

export function GestureItem(props: ItemProps): JSX.Element {
  const { x, y, stageWidth, stageHeight, selected = false, style, children } = props;
  const [item] = useState(() => createItemGesture(props));

  useEffect(() => {
    item.setProps(props);
  });

  useEffect(() => {
    item.settle();
  }, [x, y, stageWidth, stageHeight, item]);

  return (
    <View style={[StyleSheet.absoluteFill, styles.layer]} pointerEvents="box-none">
      <Animated.View style={[styles.guide, { opacity: item.guide }]} pointerEvents="none" />
      <Animated.View
        {...item.panHandlers}
        hitSlop={HIT_SLOP}
        style={[
          style,
          {
            transform: [
              { translateX: item.pan.x },
              { translateY: item.pan.y },
              { scale: item.scale },
            ],
          },
        ]}
      >
        {children}
        <Animated.View
          style={[styles.outline, { opacity: selected ? 1 : item.lift }]}
          pointerEvents="none"
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  guide: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '50%',
    width: 1,
    marginLeft: -0.5,
    backgroundColor: color.whiteA45,
  },
  outline: {
    position: 'absolute',
    top: -6,
    bottom: -6,
    left: -6,
    right: -6,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: color.white,
    borderStyle: 'dashed',
  },
});
