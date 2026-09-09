// Pinch to zoom and drag to reposition the frame while the crop tool is
// open. The crop is a zoom about the frame centre plus a pan as a fraction
// of the frame, so the stage preview and the native render agree exactly.
import { useRef, type JSX } from 'react';
import { PanResponder, StyleSheet, View, type GestureResponderEvent } from 'react-native';

import { MAX_CROP_SCALE, type EditCrop } from '../../../lib/video-edit';
import { color } from '../../../theme/tokens';

export function clampCrop(crop: EditCrop): EditCrop {
  const scale = Math.max(1, Math.min(MAX_CROP_SCALE, crop.scale));
  const limit = (scale - 1) / 2;
  return {
    scale,
    x: Math.max(-limit, Math.min(limit, crop.x)),
    y: Math.max(-limit, Math.min(limit, crop.y)),
  };
}

function touchDistance(evt: GestureResponderEvent): number | null {
  const touches = evt.nativeEvent.touches;
  if (touches.length < 2) return null;
  const dx = touches[0].pageX - touches[1].pageX;
  const dy = touches[0].pageY - touches[1].pageY;
  return Math.hypot(dx, dy);
}

export function CropGesture(props: {
  crop: EditCrop;
  stageWidth: number;
  stageHeight: number;
  onChange: (crop: EditCrop) => void;
  onCommit: (crop: EditCrop) => void;
}): JSX.Element {
  const latest = useRef(props);
  latest.current = props;
  const origin = useRef<EditCrop>(props.crop);
  const pinchStart = useRef<{ distance: number; scale: number } | null>(null);
  const live = useRef<EditCrop>(props.crop);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        origin.current = latest.current.crop;
        live.current = latest.current.crop;
        pinchStart.current = null;
      },
      onPanResponderMove: (evt, gs) => {
        const { stageWidth, stageHeight } = latest.current;
        if (stageWidth <= 0 || stageHeight <= 0) return;
        const distance = touchDistance(evt);
        let scale = live.current.scale;
        if (distance !== null) {
          if (pinchStart.current === null) {
            pinchStart.current = { distance, scale: live.current.scale };
          } else {
            scale = pinchStart.current.scale * (distance / pinchStart.current.distance);
          }
        } else {
          pinchStart.current = null;
        }
        const next = clampCrop({
          scale,
          x: origin.current.x + gs.dx / stageWidth,
          y: origin.current.y + gs.dy / stageHeight,
        });
        live.current = next;
        latest.current.onChange(next);
      },
      onPanResponderRelease: () => {
        latest.current.onCommit(live.current);
      },
      onPanResponderTerminate: () => {
        latest.current.onCommit(live.current);
      },
    }),
  ).current;

  return (
    <View style={StyleSheet.absoluteFill} {...pan.panHandlers}>
      <View style={styles.grid} pointerEvents="none">
        <View style={[styles.lineV, { left: '33.33%' }]} />
        <View style={[styles.lineV, { left: '66.66%' }]} />
        <View style={[styles.lineH, { top: '33.33%' }]} />
        <View style={[styles.lineH, { top: '66.66%' }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  lineV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: color.whiteA45,
  },
  lineH: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: color.whiteA45,
  },
});
