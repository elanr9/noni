// One stage item (text box or inset) the creator can drag with one finger,
// pinch with two, or tap. Animated values follow the fingers; the new
// position and scale are committed to the parent on release only.
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

type ItemFeedback = {
  setActive: (on: boolean) => void;
  setSnapped: (on: boolean) => void;
};

/** Gesture state and the PanResponder, kept off React so props refresh freely. */
function createItemGesture(initial: ItemProps, feedback: ItemFeedback) {
  const pan = new Animated.ValueXY({ x: 0, y: 0 });
  const scale = new Animated.Value(1);
  let props = initial;
  let origin = { x: initial.x, y: initial.y };
  let live = origin;
  let liveScale = 1;
  let pinchStart = 0;
  let pinching = false;
  let moved = false;
  let startedAt = 0;

  const rest = () =>
    pan.setValue({
      x: (props.x - 0.5) * props.stageWidth,
      y: (props.y - 0.5) * props.stageHeight,
    });

  const onGrant = () => {
    origin = { x: props.x, y: props.y };
    live = origin;
    liveScale = 1;
    pinchStart = 0;
    pinching = false;
    moved = false;
    startedAt = Date.now();
    props.onGestureStart?.();
    feedback.setActive(true);
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
    feedback.setSnapped(onCenter);
    live = { x: nx, y: ny };
    pan.setValue({ x: (nx - 0.5) * w, y: (ny - 0.5) * h });
  };

  const onRelease = () => {
    feedback.setActive(false);
    feedback.setSnapped(false);
    if (pinching) {
      scale.setValue(1);
      if (liveScale !== 1) props.onScale?.(liveScale);
      return;
    }
    if (moved) {
      if (live.x !== origin.x || live.y !== origin.y) props.onMove?.(live.x, live.y);
      return;
    }
    rest();
    if (Date.now() - startedAt < TAP_MAX_MS) props.onTap?.();
  };

  const onTerminate = () => {
    scale.setValue(1);
    rest();
    feedback.setActive(false);
    feedback.setSnapped(false);
  };

  const responder = PanResponder.create({
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
    panHandlers: responder.panHandlers,
    setProps(next: ItemProps) {
      props = next;
    },
    /** Snap the item to its stored position when nothing is being dragged. */
    settle() {
      rest();
    },
  };
}

export function GestureItem(props: ItemProps): JSX.Element {
  const { x, y, stageWidth, stageHeight, selected = false, style, children } = props;
  const [active, setActive] = useState(false);
  const [snapped, setSnapped] = useState(false);
  const [item] = useState(() => createItemGesture(props, { setActive, setSnapped }));

  useEffect(() => {
    item.setProps(props);
  });

  useEffect(() => {
    if (!active) item.settle();
  }, [x, y, stageWidth, stageHeight, active, item]);

  const outlined = active || selected;

  return (
    <View style={[StyleSheet.absoluteFill, styles.layer]} pointerEvents="box-none">
      {snapped ? <View style={styles.guide} pointerEvents="none" /> : null}
      <Animated.View
        {...item.panHandlers}
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
        {outlined ? <View style={styles.outline} pointerEvents="none" /> : null}
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
