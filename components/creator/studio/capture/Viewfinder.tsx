import type { JSX, RefObject } from 'react';
import { StyleSheet, View } from 'react-native';
import { CameraView, type CameraType } from 'expo-camera';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS, useSharedValue } from 'react-native-reanimated';

import { color } from '../../../../theme/tokens';
import { VIDEO_BITRATE } from './constants';
import { GridOverlay } from './GridOverlay';

/** A full pinch (scale 1 -> 2) moves a quarter of the device zoom range. */
const PINCH_RANGE = 0.25;

export type ViewfinderProps = {
  cameraRef: RefObject<CameraView | null>;
  facing: CameraType;
  torch: boolean;
  grid: boolean;
  zoom: number;
  onZoom(zoom: number): void;
  /** Screen-brightness flash: a white wash over the preview on the front camera. */
  frontGlow: boolean;
  onReady(): void;
  onMountError(message: string): void;
  onDoubleTap(): void;
};

function clamp01(value: number): number {
  'worklet';
  return Math.max(0, Math.min(1, value));
}

export function Viewfinder({
  cameraRef,
  facing,
  torch,
  grid,
  zoom,
  onZoom,
  frontGlow,
  onReady,
  onMountError,
  onDoubleTap,
}: ViewfinderProps): JSX.Element {
  const pinchStart = useSharedValue(zoom);
  const lastSent = useSharedValue(zoom);

  const pinch = Gesture.Pinch()
    .onStart(() => {
      pinchStart.value = zoom;
    })
    .onUpdate((e) => {
      const next = Math.round(clamp01(pinchStart.value + (e.scale - 1) * PINCH_RANGE) * 100) / 100;
      if (next !== lastSent.value) {
        lastSent.value = next;
        runOnJS(onZoom)(next);
      }
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd((_e, success) => {
      if (success) runOnJS(onDoubleTap)();
    });

  return (
    <GestureDetector gesture={Gesture.Simultaneous(pinch, doubleTap)}>
      <View style={StyleSheet.absoluteFill} accessibilityLabel="Camera preview. Pinch to zoom, double tap to flip.">
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing={facing}
          mode="video"
          mute={false}
          mirror={facing === 'front'}
          videoQuality="1080p"
          videoBitrate={VIDEO_BITRATE}
          zoom={zoom}
          enableTorch={torch && facing === 'back'}
          onCameraReady={onReady}
          onMountError={(e) => onMountError(e.message)}
        />
        {grid ? <GridOverlay /> : null}
        {frontGlow ? <View style={styles.frontGlow} pointerEvents="none" /> : null}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  frontGlow: {
    ...StyleSheet.absoluteFill,
    backgroundColor: color.whiteA45,
  },
});
