// The inset screenshot or screen recording poster at render geometry: centred
// at (x, y), `width` of the frame wide, aspect from the media, rounded
// corners. Hold and drag moves it, a two finger pinch resizes it, a tap
// selects it. Animated values follow the fingers; one commit on release.
import { memo, useEffect, useLayoutEffect, useRef, useState, type JSX } from 'react';
import {
  Animated,
  Image,
  PanResponder,
  StyleSheet,
  View,
  type GestureResponderEvent,
  type PanResponderInstance,
} from 'react-native';

import { color } from '../../../theme/tokens';
import type { ShotPreview } from '../SegmentOverlayPreview';
import { clamp } from '../slides/frame';
import { useEvent } from './useEvent';

/** Where the inset lands when nobody placed it (renderTimeline.ts IMAGE_*). */
export const DEFAULT_INSET_X = 0.72;
export const DEFAULT_INSET_Y = 0.56;
export const DEFAULT_INSET_WIDTH = 0.34;
/** Server clamp for the inset width (creator_place_segment). */
export const MIN_INSET_WIDTH = 0.15;
export const MAX_INSET_WIDTH = 0.95;
/** Corner radius as a fraction of the frame width (12px on the 390pt design stage). */
const CORNER_RADIUS = 12 / 390;
const TAP_SLOP_PX = 4;

export type InsetPlacement = { x: number; y: number; width: number };

/** The inset's centre kept fully inside the frame for its size. */
export function clampInset(
  placement: InsetPlacement,
  aspect: number,
  stage: { w: number; h: number },
): InsetPlacement {
  const width = clamp(placement.width, MIN_INSET_WIDTH, MAX_INSET_WIDTH);
  const halfW = width / 2;
  const halfH = stage.w > 0 && stage.h > 0 ? ((width * stage.w) / aspect / stage.h) * 0.5 : 0;
  return {
    width,
    x: clamp(placement.x, halfW, 1 - halfW),
    y: clamp(placement.y, Math.min(0.5, halfH), Math.max(0.5, 1 - halfH)),
  };
}

function touchDistance(evt: GestureResponderEvent): number {
  const [a, b] = evt.nativeEvent.touches;
  if (!a || !b) return 0;
  return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
}

export type StageInsetProps = {
  shot: ShotPreview;
  placement: InsetPlacement;
  stageWidth: number;
  stageHeight: number;
  selected: boolean;
  onSelect: () => void;
  onDragStart: () => void;
  onCommit: (placement: InsetPlacement) => void;
};

type Live = { pos: Animated.ValueXY; scale: Animated.Value; outline: Animated.Value };

function createInsetResponder(latest: () => StageInsetProps, live: Live): PanResponderInstance {
  let current: InsetPlacement = { x: 0, y: 0, width: 0 };
  let anchor = { dx: 0, dy: 0, x: 0, y: 0 };
  let touches = 1;
  let pinch: { distance: number; width: number } | null = null;
  let moved = false;

  const rest = () => {
    const { placement, stageWidth, stageHeight } = latest();
    live.pos.setValue({ x: (placement.x - 0.5) * stageWidth, y: (placement.y - 0.5) * stageHeight });
    live.scale.setValue(1);
  };

  return PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => {
      const { placement } = latest();
      current = { ...placement };
      anchor = { dx: 0, dy: 0, x: placement.x, y: placement.y };
      touches = 1;
      pinch = null;
      moved = false;
    },
    onPanResponderMove: (evt, gs) => {
      const { placement, shot, stageWidth: w, stageHeight: h, onDragStart } = latest();
      if (w <= 0 || h <= 0) return;
      const count = evt.nativeEvent.touches.length;
      if (count !== touches) {
        anchor = { dx: gs.dx, dy: gs.dy, x: current.x, y: current.y };
        touches = count;
        pinch = count >= 2 ? { distance: touchDistance(evt), width: current.width } : null;
      }
      if (pinch !== null) {
        const distance = touchDistance(evt);
        if (pinch.distance > 0 && distance > 0) {
          current.width = clamp(
            pinch.width * (distance / pinch.distance),
            MIN_INSET_WIDTH,
            MAX_INSET_WIDTH,
          );
          live.scale.setValue(current.width / placement.width);
        }
      }
      if (!moved && (pinch !== null || Math.hypot(gs.dx, gs.dy) > TAP_SLOP_PX)) {
        moved = true;
        live.outline.setValue(1);
        onDragStart();
      }
      if (!moved) return;
      const next = clampInset(
        {
          x: anchor.x + (gs.dx - anchor.dx) / w,
          y: anchor.y + (gs.dy - anchor.dy) / h,
          width: current.width,
        },
        shot.aspect,
        { w, h },
      );
      current = next;
      live.pos.setValue({ x: (next.x - 0.5) * w, y: (next.y - 0.5) * h });
    },
    onPanResponderRelease: () => {
      const { placement, onCommit, onSelect } = latest();
      live.outline.setValue(0);
      if (!moved) {
        rest();
        onSelect();
        return;
      }
      const changed =
        current.x !== placement.x || current.y !== placement.y || current.width !== placement.width;
      if (changed) onCommit({ ...current });
      else rest();
    },
    onPanResponderTerminate: () => {
      live.outline.setValue(0);
      rest();
    },
  });
}

export const StageInset = memo(function StageInset(props: StageInsetProps): JSX.Element {
  const { shot, placement, stageWidth, stageHeight, selected } = props;
  const latest = useRef(props);
  useLayoutEffect(() => {
    latest.current = props;
  });
  const getLatest = useEvent(() => latest.current);
  const [live] = useState<Live>(() => ({
    pos: new Animated.ValueXY(),
    scale: new Animated.Value(1),
    outline: new Animated.Value(0),
  }));
  const [pan] = useState(() => createInsetResponder(getLatest, live));

  useEffect(() => {
    live.pos.setValue({
      x: (placement.x - 0.5) * stageWidth,
      y: (placement.y - 0.5) * stageHeight,
    });
    live.scale.setValue(1);
  }, [live, placement.x, placement.y, placement.width, stageWidth, stageHeight]);

  const cardWidth = stageWidth * placement.width;
  const cardHeight = cardWidth / shot.aspect;
  const radius = stageWidth * CORNER_RADIUS;

  return (
    <View style={[StyleSheet.absoluteFill, styles.layer]} pointerEvents="box-none">
      <Animated.View
        {...pan.panHandlers}
        accessibilityRole="button"
        accessibilityLabel="Screenshot"
        accessibilityState={{ selected }}
        style={{
          width: cardWidth,
          height: cardHeight,
          transform: [{ translateX: live.pos.x }, { translateY: live.pos.y }, { scale: live.scale }],
        }}
      >
        <Image
          source={{ uri: shot.url }}
          resizeMode="cover"
          style={[styles.image, { borderRadius: radius }]}
        />
        {selected ? <View style={styles.selectedOutline} pointerEvents="none" /> : null}
        <Animated.View pointerEvents="none" style={[styles.dragOutline, { opacity: live.outline }]} />
      </Animated.View>
    </View>
  );
});

const styles = StyleSheet.create({
  layer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
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
});
