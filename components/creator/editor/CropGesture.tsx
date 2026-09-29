// Pinch to zoom and drag to reposition the frame while the crop tool is
// open. The crop is a zoom about the frame centre plus a pan as a fraction
// of the frame, so the stage preview and the native render agree exactly.
import { useLayoutEffect, useRef, useState, type JSX } from 'react';
import {
  PanResponder,
  StyleSheet,
  View,
  type GestureResponderEvent,
  type PanResponderInstance,
} from 'react-native';

import { MAX_CROP_SCALE, type EditCrop } from '../../../lib/video-edit';
import { color } from '../../../theme/tokens';
import { useEvent } from './useEvent';

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

type CropGestureProps = {
  crop: EditCrop;
  stageWidth: number;
  stageHeight: number;
  onChange: (crop: EditCrop) => void;
  onCommit: (crop: EditCrop) => void;
};

/** Built once; `latest` returns the current props so nothing goes stale. */
function createCropResponder(latest: () => CropGestureProps): PanResponderInstance {
  let origin: EditCrop = { scale: 1, x: 0, y: 0 };
  let live: EditCrop = origin;
  let pinchStart: { distance: number; scale: number } | null = null;
  const commit = () => latest().onCommit(live);
  return PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => {
      origin = latest().crop;
      live = origin;
      pinchStart = null;
    },
    onPanResponderMove: (evt, gs) => {
      const { stageWidth, stageHeight, onChange } = latest();
      if (stageWidth <= 0 || stageHeight <= 0) return;
      const distance = touchDistance(evt);
      let scale = live.scale;
      if (distance !== null) {
        if (pinchStart === null) {
          pinchStart = { distance, scale: live.scale };
        } else {
          scale = pinchStart.scale * (distance / pinchStart.distance);
        }
      } else {
        pinchStart = null;
      }
      live = clampCrop({
        scale,
        x: origin.x + gs.dx / stageWidth,
        y: origin.y + gs.dy / stageHeight,
      });
      onChange(live);
    },
    onPanResponderRelease: commit,
    onPanResponderTerminate: commit,
  });
}

export function CropGesture(props: CropGestureProps): JSX.Element {
  const latest = useRef(props);
  useLayoutEffect(() => {
    latest.current = props;
  });
  const getLatest = useEvent(() => latest.current);
  const [pan] = useState(() => createCropResponder(getLatest));

  return (
    <View style={StyleSheet.absoluteFill} {...pan.panHandlers}>
      <View style={styles.grid} pointerEvents="none">
        <View style={[styles.lineV, styles.third]} />
        <View style={[styles.lineV, styles.twoThirds]} />
        <View style={[styles.lineH, styles.thirdTop]} />
        <View style={[styles.lineH, styles.twoThirdsTop]} />
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
  third: { left: '33.33%' },
  twoThirds: { left: '66.66%' },
  thirdTop: { top: '33.33%' },
  twoThirdsTop: { top: '66.66%' },
});
