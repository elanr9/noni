// One stage item (text box or inset) the creator can drag with one finger,
// pinch with two, or tap. Every visual during the gesture is an Animated
// value on the native side (transform and opacity only); React state is
// touched only on release, when the new position or scale is committed.
// Also home to the pieces every text stage shares: the side width handles,
// the throttled live wrap width, and the pinch maths.
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type JSX,
  type MutableRefObject,
  type ReactNode,
} from 'react';
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
const HIT_SLOP = 14;
const OUTLINE_MS = 120;
/** Pinches ending within this ratio of the original size snap back to it. */
export const PINCH_SNAP = 0.03;
const HANDLE_HIT = 28;
/** React re-renders for a live wrap width are spaced at least this far apart (30Hz). */
const LIVE_WIDTH_MS = 33;

type Touch = { pageX: number; pageY: number };
export type Point = { x: number; y: number };

function touchDistance(touches: readonly Touch[]): number {
  const a = touches[0];
  const b = touches[1];
  if (a === undefined || b === undefined) return 0;
  return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
}

/** Midpoint of the first two touches in window coordinates. */
export function touchFocal(touches: readonly Touch[]): Point | null {
  const a = touches[0];
  const b = touches[1];
  if (a === undefined || b === undefined) return null;
  return { x: (a.pageX + b.pageX) / 2, y: (a.pageY + b.pageY) / 2 };
}

/** A size within PINCH_SNAP of the original reads as the original. */
export function snapToOriginal(size: number, original: number): number {
  return Math.abs(size / original - 1) < PINCH_SNAP ? original : size;
}

/** Where a centre lands after scaling by ratio about a fixed focal point. */
export function scaledCentre(centre: Point, focal: Point, ratio: number): Point {
  return {
    x: focal.x + (centre.x - focal.x) * ratio,
    y: focal.y + (centre.y - focal.y) * ratio,
  };
}

/** Window point expressed relative to the stage centre, in px. */
export function toStagePoint(
  focal: Point,
  origin: Point,
  stageWidth: number,
  stageHeight: number,
): Point {
  return {
    x: focal.x - origin.x - stageWidth / 2,
    y: focal.y - origin.y - stageHeight / 2,
  };
}

/** Wrap width under a handle drag, pushed to React at most every LIVE_WIDTH_MS. */
export function useLiveWidth(): {
  width: number | null;
  push: (px: number) => void;
  clear: () => void;
} {
  const [width, setWidth] = useState<number | null>(null);
  const last = useRef(0);
  const pending = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const push = useCallback((px: number) => {
    const wait = LIVE_WIDTH_MS - (Date.now() - last.current);
    if (wait <= 0 && timer.current === null) {
      last.current = Date.now();
      setWidth(px);
      return;
    }
    pending.current = px;
    if (timer.current !== null) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      last.current = Date.now();
      if (pending.current !== null) setWidth(pending.current);
      pending.current = null;
    }, Math.max(wait, 0));
  }, []);

  const clear = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    pending.current = null;
    setWidth(null);
  }, []);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  return { width, push, clear };
}

export type WidthDrag = {
  onStart: () => void;
  /** Total width change in px, already doubled so the box grows symmetrically. */
  onChange: (deltaWidth: number) => void;
  onEnd: () => void;
  onCancel: () => void;
};

/**
 * Handle drag for one text box: starts from the rendered content width,
 * clamps between the widest word and the frame bound, and commits on release.
 */
export function useWidthDrag(params: {
  /** Rendered content width in px when the drag starts. */
  start: () => number;
  min: () => number;
  max: () => number;
  onStart?: () => void;
  onCommit: (px: number) => void;
}): { liveWidth: number | null; drag: WidthDrag } {
  const live = useLiveWidth();
  const latest = useRef(params);
  useLayoutEffect(() => {
    latest.current = params;
  });
  const state = useRef({ start: 0, current: 0 });

  const [drag] = useState<WidthDrag>(() => ({
    onStart: () => {
      const start = latest.current.start();
      state.current = { start, current: start };
      latest.current.onStart?.();
    },
    onChange: (deltaWidth) => {
      const { min, max } = latest.current;
      const next = clamp(state.current.start + deltaWidth, min(), max());
      state.current.current = next;
      live.push(next);
    },
    onEnd: () => {
      live.clear();
      const { start, current } = state.current;
      if (current !== start) latest.current.onCommit(current);
    },
    onCancel: () => live.clear(),
  }));

  return { liveWidth: live.width, drag };
}

function Handle(props: { side: -1 | 1; drag: MutableRefObject<WidthDrag> }): JSX.Element {
  const { side, drag } = props;
  const [pan] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => drag.current.onStart(),
      onPanResponderMove: (_evt, gs) => drag.current.onChange(2 * side * gs.dx),
      onPanResponderRelease: () => drag.current.onEnd(),
      onPanResponderTerminate: () => drag.current.onCancel(),
    }),
  );
  return (
    <View
      {...pan.panHandlers}
      accessibilityRole="adjustable"
      accessibilityLabel={side < 0 ? 'Left width handle' : 'Right width handle'}
      style={[styles.handleHit, side < 0 ? styles.handleLeft : styles.handleRight]}
    >
      <View style={styles.handlePill} />
    </View>
  );
}

/** Side grips on the selected box; each claims its touch before the box does. */
export function WidthHandles(props: { visible: boolean; drag: WidthDrag }): JSX.Element | null {
  const dragRef = useRef(props.drag);
  useLayoutEffect(() => {
    dragRef.current = props.drag;
  });
  if (!props.visible) return null;
  return (
    <>
      <Handle side={-1} drag={dragRef} />
      <Handle side={1} drag={dragRef} />
    </>
  );
}

type ItemProps = {
  x: number;
  y: number;
  /** Size the item is rendered at; a change settles the live scale back to 1. */
  size?: number;
  stageWidth: number;
  stageHeight: number;
  /** Fires on release with the new centre fractions. */
  onMove?: (x: number, y: number) => void;
  /** Fires on release with the pinch ratio, already clamped to min..max, and
   * the centre the item scaled to about the pinch focal point. */
  onScale?: (ratio: number, x: number, y: number) => void;
  minScale?: number;
  maxScale?: number;
  /** Scale about the pinch midpoint instead of the item centre. */
  focalPinch?: boolean;
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
type MeasureStage = (onMeasured: (origin: Point) => void) => void;

function createItemGesture(initial: ItemProps) {
  const start = centerPx(initial);
  const pan = new Animated.ValueXY(start);
  const scale = new Animated.Value(1);
  const guide = new Animated.Value(0);
  const outline = new Animated.Value(initial.selected ? 1 : 0);
  driveNatively(pan.x, start.x);
  driveNatively(pan.y, start.y);
  driveNatively(scale, 1);
  driveNatively(guide, 0);
  driveNatively(outline, initial.selected ? 1 : 0);

  const showOutline = (on: boolean) =>
    Animated.timing(outline, {
      toValue: on ? 1 : 0,
      duration: OUTLINE_MS,
      useNativeDriver: true,
    }).start();

  let props = initial;
  let measureStage: MeasureStage = () => undefined;
  let origin = { x: initial.x, y: initial.y };
  let live = origin;
  let liveScale = 1;
  let pinchStart = 0;
  let pinching = false;
  let pinchCentre: Point = { x: 0, y: 0 };
  let focal: Point = { x: 0, y: 0 };
  let stageOrigin: Point = { x: 0, y: 0 };
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
    measureStage((o) => {
      stageOrigin = o;
    });
    props.onGestureStart?.();
    showOutline(true);
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
        pinchCentre = { x: (live.x - 0.5) * w, y: (live.y - 0.5) * h };
        const f = props.focalPinch === true ? touchFocal(touches) : null;
        focal = f === null ? pinchCentre : toStagePoint(f, stageOrigin, w, h);
        setSnapped(false);
        return;
      }
      if (dist <= 0) return;
      liveScale = clamp(
        snapToOriginal(dist / pinchStart, 1),
        props.minScale ?? 1,
        props.maxScale ?? 1,
      );
      const c = scaledCentre(pinchCentre, focal, liveScale);
      live = {
        x: clamp(c.x / w + 0.5, PLACE_EDGE, 1 - PLACE_EDGE),
        y: clamp(c.y / h + 0.5, PLACE_EDGE, 1 - PLACE_EDGE),
      };
      pan.x.setValue((live.x - 0.5) * w);
      pan.y.setValue((live.y - 0.5) * h);
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
    showOutline(props.selected === true);
    setSnapped(false);
  };

  const onRelease = () => {
    finish();
    if (pinching) {
      scale.setValue(1);
      if (liveScale !== 1) props.onScale?.(liveScale, live.x, live.y);
      else rest();
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
    outline,
    panHandlers: responder.panHandlers,
    setProps(next: ItemProps) {
      const selectionChanged = (next.selected === true) !== (props.selected === true);
      props = next;
      if (selectionChanged && !dragging) showOutline(next.selected === true);
    },
    /** How to find the stage's window origin; needed to place the pinch focal point. */
    setMeasureStage(next: MeasureStage) {
      measureStage = next;
    },
    /** Snap the item to its stored position and scale when nothing is being dragged. */
    settle() {
      if (dragging) return;
      rest();
      scale.setValue(1);
    },
  };
}

export function GestureItem(props: ItemProps): JSX.Element {
  const { x, y, size, stageWidth, stageHeight, style, children } = props;
  const layerRef = useRef<View>(null);
  const [item] = useState(() => createItemGesture(props));

  useEffect(() => {
    item.setProps(props);
  });

  useEffect(() => {
    item.setMeasureStage((onMeasured) => {
      layerRef.current?.measureInWindow((px, py) => onMeasured({ x: px, y: py }));
    });
  }, [item]);

  useEffect(() => {
    item.settle();
  }, [x, y, size, stageWidth, stageHeight, item]);

  return (
    <View ref={layerRef} style={[StyleSheet.absoluteFill, styles.layer]} pointerEvents="box-none">
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
          style={[styles.outline, { opacity: item.outline }]}
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
  handleHit: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: HANDLE_HIT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handleLeft: {
    left: -HANDLE_HIT / 2 - 6,
  },
  handleRight: {
    right: -HANDLE_HIT / 2 - 6,
  },
  handlePill: {
    width: 6,
    height: 26,
    borderRadius: 3,
    backgroundColor: color.white,
    borderWidth: 1,
    borderColor: color.ink900,
  },
});
