// The clip's on-screen text boxes at their real spot in the 9:16 frame. When
// editable, each box drags, pinches to scale and taps to edit its words.
// Gestures move Animated values only; the box commits on release.
import { useEffect, useRef, useState, type JSX } from 'react';
import {
  Animated,
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
import { rectsOverlap, type FrameRect } from './FrameGuides';
import type { StageFrame } from './stageFrame';

export type BoxPatch = Partial<Pick<OverlayBox, 'x' | 'y' | 'size' | 'width'>>;

const EDGE = 0.02;
const SNAP = 0.025;
const TAP_SLOP = 6;

type BoxGesture = {
  startX: number;
  startY: number;
  moved: boolean;
  dx: number;
  dy: number;
  /** Finger distance and midpoint (stage px from the centre) when the pinch began. */
  pinch: { distance: number; focal: Point } | null;
  scale: number;
  snapped: boolean;
  overlapping: boolean;
};

const IDLE_GESTURE: BoxGesture = {
  startX: 0,
  startY: 0,
  moved: false,
  dx: 0,
  dy: 0,
  pinch: null,
  scale: 1,
  snapped: false,
  overlapping: false,
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function touchDistance(evt: GestureResponderEvent): number | null {
  const [a, b] = evt.nativeEvent.touches;
  if (a === undefined || b === undefined) return null;
  return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
}

function EditableTextBox(props: {
  box: OverlayBox;
  frame: StageFrame;
  editable: boolean;
  /** Area the box should stay clear of (the subtitle band); warns while dragging. */
  avoid: FrameRect | null;
  /** Shows the width handles. */
  selected: boolean;
  onChange: (patch: BoxPatch) => void;
  onTap: () => void;
  onGestureStart?: () => void;
}): JSX.Element | null {
  const { box, frame, editable, avoid, selected, onChange, onTap, onGestureStart } = props;
  const [offset] = useState(() => new Animated.ValueXY({ x: 0, y: 0 }));
  const [scale] = useState(() => new Animated.Value(1));
  const [active, setActive] = useState(false);
  const [snapped, setSnapped] = useState(false);
  const [overlapping, setOverlapping] = useState(false);
  const sizeRef = useRef({ w: 0, h: 0 });
  const layerRef = useRef<View>(null);
  const stageOrigin = useRef<Point>({ x: 0, y: 0 });
  const gesture = useRef<BoxGesture>(IDLE_GESTURE);
  const pendingReset = useRef(false);
  const fontSize = frame.width * box.size;
  const { liveWidth, drag } = useWidthDrag({
    start: () => sizeRef.current.w,
    min: () =>
      Math.max(MIN_BOX_WIDTH * frame.width, overlayMinWrapWidth(box.text, box.bg, fontSize)),
    max: () => MAX_BOX_WIDTH * frame.width,
    onStart: onGestureStart,
    onCommit: (px) => onChange({ width: px / frame.width }),
  });

  /** Live box rect in frame fractions for the current gesture offset and scale. */
  const checkOverlap = () => {
    const g = gesture.current;
    if (avoid === null) return;
    const cx = box.x + g.dx / frame.width;
    const cy = box.y + g.dy / frame.height;
    const halfW = (sizeRef.current.w * g.scale) / frame.width / 2;
    const halfH = (sizeRef.current.h * g.scale) / frame.height / 2;
    const hit = rectsOverlap(
      { left: cx - halfW, right: cx + halfW, top: cy - halfH, bottom: cy + halfH },
      avoid,
    );
    if (hit !== g.overlapping) {
      g.overlapping = hit;
      setOverlapping(hit);
    }
  };

  // The parent re-renders the box at its committed spot; clearing the
  // gesture offset in that same commit keeps it from jumping.
  useEffect(() => {
    if (!pendingReset.current) return;
    pendingReset.current = false;
    offset.setValue({ x: 0, y: 0 });
    scale.setValue(1);
  }, [box.x, box.y, box.size, offset, scale]);

  const onGrant = (evt: GestureResponderEvent) => {
    gesture.current = {
      ...IDLE_GESTURE,
      startX: evt.nativeEvent.pageX,
      startY: evt.nativeEvent.pageY,
    };
    layerRef.current?.measureInWindow((px, py) => {
      stageOrigin.current = { x: px, y: py };
    });
    onGestureStart?.();
    setActive(true);
    checkOverlap();
  };

  const onMove = (evt: GestureResponderEvent) => {
    const g = gesture.current;
    if (evt.nativeEvent.touches.length >= 2) {
      const dist = touchDistance(evt);
      if (dist === null) return;
      if (g.pinch === null) {
        const centre = { x: (box.x - 0.5) * frame.width, y: (box.y - 0.5) * frame.height };
        const focal = touchFocal(evt.nativeEvent.touches);
        g.pinch = {
          distance: dist,
          focal:
            focal === null
              ? centre
              : toStagePoint(focal, stageOrigin.current, frame.width, frame.height),
        };
        g.moved = true;
        return;
      }
      // Two fingers: size only, scaled about the pinch midpoint. The centre
      // shift is carried as the drag offset so release commits it with the size.
      g.scale = snapToOriginal(
        clamp(dist / g.pinch.distance, MIN_BOX_SIZE / box.size, MAX_BOX_SIZE / box.size),
        1,
      );
      const centre = { x: (box.x - 0.5) * frame.width, y: (box.y - 0.5) * frame.height };
      const moved = scaledCentre(centre, g.pinch.focal, g.scale);
      g.dx = moved.x - centre.x;
      g.dy = moved.y - centre.y;
      offset.setValue({ x: g.dx, y: g.dy });
      scale.setValue(g.scale);
      checkOverlap();
      return;
    }
    if (g.pinch !== null) return;
    let dx = evt.nativeEvent.pageX - g.startX;
    const dy = evt.nativeEvent.pageY - g.startY;
    if (Math.abs(dx) + Math.abs(dy) > TAP_SLOP) g.moved = true;
    const snap = Math.abs(box.x + dx / frame.width - 0.5) < SNAP;
    if (snap) dx = (0.5 - box.x) * frame.width;
    if (snap !== g.snapped) {
      g.snapped = snap;
      setSnapped(snap);
    }
    g.dx = dx;
    g.dy = dy;
    offset.setValue({ x: dx, y: dy });
    checkOverlap();
  };

  const onRelease = () => {
    const g = gesture.current;
    const patch: BoxPatch = {};
    if (g.pinch !== null && g.scale !== 1) {
      patch.size = clamp(box.size * g.scale, MIN_BOX_SIZE, MAX_BOX_SIZE);
    }
    if (g.moved) {
      patch.x = clamp(box.x + g.dx / frame.width, EDGE, 1 - EDGE);
      patch.y = clamp(box.y + g.dy / frame.height, EDGE, 1 - EDGE);
    }
    setActive(false);
    setSnapped(false);
    setOverlapping(false);
    const changed =
      (patch.size !== undefined && patch.size !== box.size) ||
      (patch.x !== undefined && (patch.x !== box.x || patch.y !== box.y));
    if (changed) {
      pendingReset.current = true;
      onChange(patch);
      return;
    }
    if (!g.moved && g.pinch === null) onTap();
    offset.setValue({ x: 0, y: 0 });
    scale.setValue(1);
  };

  const onTerminate = () => {
    setActive(false);
    setSnapped(false);
    setOverlapping(false);
    Animated.parallel([
      Animated.spring(offset, { toValue: { x: 0, y: 0 }, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true }),
    ]).start();
  };

  const text = box.text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join('\n');
  if (text.length === 0) return null;

  return (
    <View ref={layerRef} style={styles.layer} pointerEvents={editable ? 'box-none' : 'none'}>
      {snapped ? <View style={styles.guide} pointerEvents="none" /> : null}
      <Animated.View
        onStartShouldSetResponder={() => editable}
        onMoveShouldSetResponder={() => editable}
        onResponderTerminationRequest={() => false}
        onResponderGrant={onGrant}
        onResponderMove={onMove}
        onResponderRelease={onRelease}
        onResponderTerminate={onTerminate}
        accessibilityRole={editable ? 'button' : undefined}
        accessibilityLabel={editable ? `Edit text: ${text}` : undefined}
        onLayout={(e) => {
          sizeRef.current = { w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height };
        }}
        style={{
          transform: [
            { translateX: (box.x - 0.5) * frame.width },
            { translateY: (box.y - 0.5) * frame.height },
            { translateX: offset.x },
            { translateY: offset.y },
            { scale },
          ],
        }}
      >
        <OverlayTextBox
          text={text}
          color={box.color}
          bg={box.bg}
          fontSize={fontSize}
          maxWidth={liveWidth ?? overlayWrapWidth(box.width, frame.width)}
        />
        <WidthHandles visible={editable && selected} drag={drag} />
        {active ? (
          <View
            style={[styles.outline, overlapping && styles.outlineWarn]}
            pointerEvents="none"
          />
        ) : null}
      </Animated.View>
    </View>
  );
}

export function TextBoxLayer(props: {
  boxes: OverlayBox[];
  frame: StageFrame;
  editable: boolean;
  /** Frame rect boxes should keep clear of; a dragged box overlapping it warns. */
  avoid?: FrameRect | null;
  /** Box showing width handles; omitted means every editable box shows them. */
  selectedBoxId?: string | null;
  onChangeBox?: (boxId: string, patch: BoxPatch) => void;
  onTapBox?: (boxId: string) => void;
  onGestureStart?: () => void;
}): JSX.Element | null {
  const {
    boxes,
    frame,
    editable,
    avoid = null,
    selectedBoxId,
    onChangeBox,
    onTapBox,
    onGestureStart,
  } = props;
  if (boxes.length === 0) return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={editable ? 'box-none' : 'none'}>
      {boxes.map((box) => (
        <EditableTextBox
          key={box.id}
          box={box}
          frame={frame}
          editable={editable}
          avoid={avoid}
          selected={selectedBoxId === undefined || selectedBoxId === box.id}
          onChange={(patch) => onChangeBox?.(box.id, patch)}
          onTap={() => onTapBox?.(box.id)}
          onGestureStart={onGestureStart}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFill,
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
  outlineWarn: {
    borderColor: color.danger,
    borderStyle: 'solid',
    backgroundColor: 'rgba(217,58,58,0.12)',
  },
});
