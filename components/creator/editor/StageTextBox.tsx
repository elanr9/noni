// One creator text box on the stage. Drag moves it, a two finger pinch
// resizes it, a tap selects it and a second tap opens the words. Position
// and scale live in Animated values driven straight from the gesture; the
// box model is committed once on release.
import { memo, useEffect, useLayoutEffect, useRef, useState, type JSX } from 'react';
import {
  Animated,
  PanResponder,
  StyleSheet,
  View,
  type GestureResponderEvent,
} from 'react-native';

import {
  MAX_BOX_SIZE,
  MAX_BOX_WIDTH,
  MIN_BOX_SIZE,
  MIN_BOX_WIDTH,
  type OverlayBox,
} from '../../../lib/overlay-boxes';
import { color } from '../../../theme/tokens';
import { OverlayTextBox, overlayMinWrapWidth, overlayWrapWidth } from '../../ui/OverlayTextBox';
import {
  WidthHandles,
  scaledCentre,
  snapToOriginal,
  toStagePoint,
  touchFocal,
  useWidthDrag,
  type Point,
} from '../slides/GestureItem';

/** Geometry a gesture commits; width only when a handle drag changed it. */
export type BoxPlacement = { x: number; y: number; size: number; width?: number };

const EDGE = 0.06;
const SNAP = 0.025;
const TAP_SLOP_PX = 4;
const DOUBLE_TAP_MS = 300;

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function touchDistance(evt: GestureResponderEvent): number {
  const [a, b] = evt.nativeEvent.touches;
  if (!a || !b) return 0;
  return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
}

type Gesture = {
  live: BoxPlacement;
  anchor: { dx: number; dy: number; x: number; y: number };
  touches: number;
  /** Distance, size and centre (stage px) when the pinch began, and its focal point. */
  pinch: { distance: number; size: number; centre: Point; focal: Point } | null;
  moved: boolean;
};

/** Vertical band (frame height fractions) a box should stay clear of. */
export type AvoidBand = { top: number; bottom: number };

export type StageTextBoxProps = {
  box: OverlayBox;
  stageWidth: number;
  stageHeight: number;
  selected: boolean;
  /** The subtitle band; a dragged box overlapping it shows a red outline. */
  avoidBand: AvoidBand | null;
  onSelect: (boxId: string) => void;
  onEdit: (boxId: string) => void;
  onDragStart: () => void;
  onCommit: (boxId: string, placement: BoxPlacement) => void;
};

export const StageTextBox = memo(function StageTextBox(props: StageTextBoxProps): JSX.Element {
  const { box, stageWidth, stageHeight, selected } = props;
  const [pos] = useState(() => new Animated.ValueXY());
  const [scale] = useState(() => new Animated.Value(1));
  const [dragOutline] = useState(() => new Animated.Value(0));
  const [overlapOutline] = useState(() => new Animated.Value(0));
  const [selectedOutline] = useState(() => new Animated.Value(selected ? 1 : 0));
  const contentSize = useRef({ w: 0, h: 0 });
  const layerRef = useRef<View>(null);
  const stageOrigin = useRef<Point>({ x: 0, y: 0 });
  const fontSize = stageWidth * box.size;

  useEffect(() => {
    Animated.spring(selectedOutline, {
      toValue: selected ? 1 : 0,
      useNativeDriver: true,
      speed: 30,
      bounciness: 6,
    }).start();
  }, [selected, selectedOutline]);
  const latest = useRef(props);
  useLayoutEffect(() => {
    latest.current = props;
  });
  const { liveWidth, drag } = useWidthDrag({
    start: () => contentSize.current.w,
    min: () =>
      Math.max(MIN_BOX_WIDTH * stageWidth, overlayMinWrapWidth(box.text, box.bg, fontSize)),
    max: () => MAX_BOX_WIDTH * stageWidth,
    onStart: () => latest.current.onDragStart(),
    onCommit: (px) => {
      const { box: b, onCommit } = latest.current;
      onCommit(b.id, { x: b.x, y: b.y, size: b.size, width: px / stageWidth });
    },
  });
  const lastTapAt = useRef(0);
  const gesture = useRef<Gesture>({
    live: { x: box.x, y: box.y, size: box.size },
    anchor: { dx: 0, dy: 0, x: box.x, y: box.y },
    touches: 1,
    pinch: null,
    moved: false,
  });

  useEffect(() => {
    pos.setValue({ x: (box.x - 0.5) * stageWidth, y: (box.y - 0.5) * stageHeight });
    scale.setValue(1);
  }, [pos, scale, box.x, box.y, box.size, stageWidth, stageHeight]);

  const [pan] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        const { box: b } = latest.current;
        gesture.current = {
          live: { x: b.x, y: b.y, size: b.size },
          anchor: { dx: 0, dy: 0, x: b.x, y: b.y },
          touches: 1,
          pinch: null,
          moved: false,
        };
        layerRef.current?.measureInWindow((px, py) => {
          stageOrigin.current = { x: px, y: py };
        });
      },
      onPanResponderMove: (evt, gs) => {
        const { box: b, stageWidth: w, stageHeight: h, onDragStart } = latest.current;
        if (w <= 0 || h <= 0) return;
        const g = gesture.current;
        const touches = evt.nativeEvent.touches.length;
        if (touches !== g.touches) {
          g.anchor = { dx: gs.dx, dy: gs.dy, x: g.live.x, y: g.live.y };
          g.touches = touches;
          if (touches >= 2) {
            const centre = { x: (g.live.x - 0.5) * w, y: (g.live.y - 0.5) * h };
            const focal = touchFocal(evt.nativeEvent.touches);
            g.pinch = {
              distance: touchDistance(evt),
              size: g.live.size,
              centre,
              focal: focal === null ? centre : toStagePoint(focal, stageOrigin.current, w, h),
            };
          } else {
            g.pinch = null;
          }
        }
        if (!g.moved && (g.pinch !== null || Math.hypot(gs.dx, gs.dy) > TAP_SLOP_PX)) {
          g.moved = true;
          dragOutline.setValue(1);
          onDragStart();
        }
        if (!g.moved) return;
        let nx: number;
        let ny: number;
        if (g.pinch !== null) {
          // Two fingers: size only, scaled about the pinch midpoint.
          const distance = touchDistance(evt);
          if (g.pinch.distance <= 0 || distance <= 0) return;
          const size = snapToOriginal(
            clamp(g.pinch.size * (distance / g.pinch.distance), MIN_BOX_SIZE, MAX_BOX_SIZE),
            b.size,
          );
          const c = scaledCentre(g.pinch.centre, g.pinch.focal, size / g.pinch.size);
          g.live.size = size;
          nx = clamp(c.x / w + 0.5, EDGE, 1 - EDGE);
          ny = clamp(c.y / h + 0.5, EDGE, 1 - EDGE);
          scale.setValue(size / b.size);
        } else {
          nx = clamp(g.anchor.x + (gs.dx - g.anchor.dx) / w, EDGE, 1 - EDGE);
          ny = clamp(g.anchor.y + (gs.dy - g.anchor.dy) / h, EDGE, 1 - EDGE);
          if (Math.abs(nx - 0.5) < SNAP) nx = 0.5;
        }
        g.live.x = nx;
        g.live.y = ny;
        pos.setValue({ x: (nx - 0.5) * w, y: (ny - 0.5) * h });
        const band = latest.current.avoidBand;
        if (band !== null) {
          const halfH = ((contentSize.current.h * (g.live.size / b.size)) / h) * 0.5;
          const overlaps = ny - halfH < band.bottom && ny + halfH > band.top;
          overlapOutline.setValue(overlaps ? 1 : 0);
        }
      },
      onPanResponderRelease: () => {
        const { box: b, onCommit, onSelect, onEdit } = latest.current;
        const g = gesture.current;
        dragOutline.setValue(0);
        overlapOutline.setValue(0);
        if (g.moved) {
          const changed = g.live.x !== b.x || g.live.y !== b.y || g.live.size !== b.size;
          if (changed) onCommit(b.id, { ...g.live });
          else scale.setValue(1);
          return;
        }
        const now = Date.now();
        if (now - lastTapAt.current < DOUBLE_TAP_MS) {
          lastTapAt.current = 0;
          onEdit(b.id);
        } else {
          lastTapAt.current = now;
          onSelect(b.id);
        }
      },
      onPanResponderTerminate: () => {
        const { box: b, stageWidth: w, stageHeight: h } = latest.current;
        dragOutline.setValue(0);
        overlapOutline.setValue(0);
        scale.setValue(1);
        pos.setValue({ x: (b.x - 0.5) * w, y: (b.y - 0.5) * h });
      },
    }),
  );

  return (
    <View ref={layerRef} style={[StyleSheet.absoluteFill, styles.layer]} pointerEvents="box-none">
      <Animated.View
        {...pan.panHandlers}
        accessibilityRole="button"
        accessibilityLabel={`Text box ${box.text}`}
        accessibilityState={{ selected }}
        style={{
          transform: [{ translateX: pos.x }, { translateY: pos.y }, { scale }],
        }}
      >
        <View
          onLayout={(e) => {
            const { width, height } = e.nativeEvent.layout;
            contentSize.current = { w: width, h: height };
          }}
        >
          <OverlayTextBox
            text={box.text}
            color={box.color}
            bg={box.bg}
            fontSize={fontSize}
            maxWidth={liveWidth ?? overlayWrapWidth(box.width, stageWidth)}
          />
        </View>
        <WidthHandles visible={selected} drag={drag} />
        <Animated.View
          pointerEvents="none"
          style={[
            styles.selectedOutline,
            {
              opacity: selectedOutline,
              transform: [
                { scale: selectedOutline.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) },
              ],
            },
          ]}
        />
        <Animated.View
          pointerEvents="none"
          style={[styles.dragOutline, { opacity: dragOutline }]}
        />
        <Animated.View
          pointerEvents="none"
          style={[styles.overlapOutline, { opacity: overlapOutline }]}
        />
      </Animated.View>
    </View>
  );
});

const styles = StyleSheet.create({
  layer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedOutline: {
    position: 'absolute',
    top: -6,
    bottom: -6,
    left: -6,
    right: -6,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: color.white,
  },
  dragOutline: {
    position: 'absolute',
    top: -6,
    bottom: -6,
    left: -6,
    right: -6,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: color.whiteA75,
    borderStyle: 'dashed',
  },
  overlapOutline: {
    position: 'absolute',
    top: -8,
    bottom: -8,
    left: -8,
    right: -8,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'rgba(254,44,85,0.75)',
  },
});
