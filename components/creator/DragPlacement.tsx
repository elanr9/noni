// One item (text box or inset picture) centered at a stage fraction. When
// onMove is given the creator can hold and drag it anywhere on the stage;
// only the position changes, never the size or look. Snaps to the
// horizontal center and shows a guide while snapped.
import { useRef, useState, type JSX, type ReactNode } from 'react';
import {
  Animated,
  PanResponder,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { color } from '../../theme/tokens';

export type PlacementMove = (x: number, y: number) => void;

const EDGE = 0.06;
const SNAP = 0.025;

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export function DragPlacement(props: {
  x: number;
  y: number;
  stageWidth: number;
  stageHeight: number;
  /** Fires on release with the new center fractions. Absent = static. */
  onMove?: PlacementMove;
  onDragStart?: () => void;
  /** 'y' keeps the item on its horizontal position and only moves it up or down. */
  axis?: 'both' | 'y';
  /** Style for the centering layer (padding keeps text off the edges). */
  layerStyle?: StyleProp<ViewStyle>;
  /** Style for the item wrapper itself. */
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}): JSX.Element {
  const {
    x,
    y,
    stageWidth,
    stageHeight,
    onMove,
    onDragStart,
    axis = 'both',
    layerStyle,
    style,
    children,
  } = props;
  const [live, setLive] = useState<{ x: number; y: number } | null>(null);
  const liveRef = useRef<{ x: number; y: number } | null>(null);
  const scale = useRef(new Animated.Value(1)).current;
  const originRef = useRef({ x, y });
  const latest = useRef({ x, y, stageWidth, stageHeight, onMove, onDragStart, axis });
  latest.current = { x, y, stageWidth, stageHeight, onMove, onDragStart, axis };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => latest.current.onMove !== undefined,
      onMoveShouldSetPanResponder: () => latest.current.onMove !== undefined,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        originRef.current = { x: latest.current.x, y: latest.current.y };
        latest.current.onDragStart?.();
        liveRef.current = { ...originRef.current };
        setLive({ ...originRef.current });
        Animated.spring(scale, {
          toValue: 1.04,
          useNativeDriver: true,
          speed: 40,
          bounciness: 4,
        }).start();
      },
      onPanResponderMove: (_evt, gs) => {
        const { stageWidth: w, stageHeight: h } = latest.current;
        if (w <= 0 || h <= 0) return;
        let nx =
          latest.current.axis === 'y'
            ? originRef.current.x
            : clamp(originRef.current.x + gs.dx / w, EDGE, 1 - EDGE);
        const ny = clamp(originRef.current.y + gs.dy / h, EDGE, 1 - EDGE);
        if (latest.current.axis !== 'y' && Math.abs(nx - 0.5) < SNAP) nx = 0.5;
        liveRef.current = { x: nx, y: ny };
        setLive({ x: nx, y: ny });
      },
      onPanResponderRelease: () => {
        Animated.spring(scale, {
          toValue: 1,
          useNativeDriver: true,
          speed: 40,
          bounciness: 4,
        }).start();
        const pos = liveRef.current;
        const origin = originRef.current;
        liveRef.current = null;
        if (pos !== null && (pos.x !== origin.x || pos.y !== origin.y)) {
          latest.current.onMove?.(pos.x, pos.y);
        }
        setLive(null);
      },
      onPanResponderTerminate: () => {
        scale.setValue(1);
        liveRef.current = null;
        setLive(null);
      },
    }),
  ).current;

  const cx = live?.x ?? x;
  const cy = live?.y ?? y;
  const draggable = onMove !== undefined;
  const snapped = axis !== 'y' && live !== null && cx === 0.5;

  return (
    <View
      style={[StyleSheet.absoluteFill, styles.layer, layerStyle]}
      pointerEvents={draggable ? 'box-none' : 'none'}
    >
      {snapped ? <View style={styles.guide} pointerEvents="none" /> : null}
      <Animated.View
        {...(draggable ? pan.panHandlers : {})}
        style={[
          style,
          {
            transform: [
              { translateX: (cx - 0.5) * stageWidth },
              { translateY: (cy - 0.5) * stageHeight },
              { scale },
            ],
          },
        ]}
      >
        {children}
        {live !== null ? (
          <View style={styles.outline} pointerEvents="none" />
        ) : null}
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
