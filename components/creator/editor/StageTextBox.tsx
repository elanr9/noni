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
  MIN_BOX_SIZE,
  OVERLAY_TEXT_SPEC,
  type OverlayBox,
} from '../../../lib/overlay-boxes';
import { color } from '../../../theme/tokens';
import { OverlayTextBox } from '../../ui/OverlayTextBox';

export type BoxPlacement = { x: number; y: number; size: number };

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
  pinch: { distance: number; size: number } | null;
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
  const contentHeight = useRef(0);

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
      },
      onPanResponderMove: (evt, gs) => {
        const { box: b, stageWidth: w, stageHeight: h, onDragStart } = latest.current;
        if (w <= 0 || h <= 0) return;
        const g = gesture.current;
        const touches = evt.nativeEvent.touches.length;
        if (touches !== g.touches) {
          g.anchor = { dx: gs.dx, dy: gs.dy, x: g.live.x, y: g.live.y };
          g.touches = touches;
          g.pinch = touches >= 2 ? { distance: touchDistance(evt), size: g.live.size } : null;
        }
        if (g.pinch !== null) {
          const distance = touchDistance(evt);
          if (g.pinch.distance > 0 && distance > 0) {
            g.live.size = clamp(
              g.pinch.size * (distance / g.pinch.distance),
              MIN_BOX_SIZE,
              MAX_BOX_SIZE,
            );
            scale.setValue(g.live.size / b.size);
          }
        }
        let nx = clamp(g.anchor.x + (gs.dx - g.anchor.dx) / w, EDGE, 1 - EDGE);
        const ny = clamp(g.anchor.y + (gs.dy - g.anchor.dy) / h, EDGE, 1 - EDGE);
        if (Math.abs(nx - 0.5) < SNAP) nx = 0.5;
        if (!g.moved && (g.pinch !== null || Math.hypot(gs.dx, gs.dy) > TAP_SLOP_PX)) {
          g.moved = true;
          dragOutline.setValue(1);
          onDragStart();
        }
        if (!g.moved) return;
        g.live.x = nx;
        g.live.y = ny;
        pos.setValue({ x: (nx - 0.5) * w, y: (ny - 0.5) * h });
        const band = latest.current.avoidBand;
        if (band !== null) {
          const halfH = ((contentHeight.current * (g.live.size / b.size)) / h) * 0.5;
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
    <View style={[StyleSheet.absoluteFill, styles.layer]} pointerEvents="box-none">
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
            contentHeight.current = e.nativeEvent.layout.height;
          }}
        >
          <OverlayTextBox
            text={box.text}
            color={box.color}
            bg={box.bg}
            fontSize={stageWidth * box.size}
            maxWidth={OVERLAY_TEXT_SPEC.maxWidth * stageWidth}
          />
        </View>
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
