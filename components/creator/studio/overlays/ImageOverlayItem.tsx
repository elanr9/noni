// One picture pop-up on the stage: centred at (x, y), `width` of the frame
// wide, aspect from the asset, rounded corners.
import { memo, type JSX } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';

import { updateOverlay, type ImageOverlay, type MediaAsset } from '../../../../lib/edit-document';
import { color } from '../../../../theme/tokens';
import { IMAGE_CORNER_RADIUS, MAX_IMAGE_WIDTH, MIN_IMAGE_WIDTH } from './geometry';
import { applyGesture, confirmDeleteOverlay, selectOverlay } from './overlay-actions';
import { useOverlayImage } from './useOverlayImage';
import { useStageGesture } from './useStageGesture';

const HIT_SLOP = 14;

export type ImageOverlayItemProps = {
  overlay: ImageOverlay;
  asset: MediaAsset | null;
  stageWidth: number;
  stageHeight: number;
  selected: boolean;
};

export const ImageOverlayItem = memo(function ImageOverlayItem(props: ImageOverlayItemProps): JSX.Element {
  const { overlay, asset, stageWidth, stageHeight, selected } = props;
  const { uri, aspect } = useOverlayImage(asset);
  const cardWidth = stageWidth * overlay.width;
  const cardHeight = cardWidth / aspect;
  const radius = stageWidth * IMAGE_CORNER_RADIUS;

  const { gesture, itemStyle, guideStyle, dragOutlineStyle } = useStageGesture({
    x: overlay.x,
    y: overlay.y,
    size: overlay.width,
    stageWidth,
    stageHeight,
    minRatio: MIN_IMAGE_WIDTH / overlay.width,
    maxRatio: MAX_IMAGE_WIDTH / overlay.width,
    onMove: (x, y) => applyGesture((doc) => updateOverlay(doc, overlay.id, { x, y })),
    onScale: (ratio, x, y) =>
      applyGesture((doc) => updateOverlay(doc, overlay.id, { width: overlay.width * ratio, x, y })),
    onTap: () => selectOverlay(overlay.id),
    onLongPress: () => confirmDeleteOverlay(overlay.id, 'this picture'),
  });

  return (
    <View style={[StyleSheet.absoluteFill, styles.layer]} pointerEvents="box-none">
      <Animated.View style={[styles.guide, guideStyle]} pointerEvents="none" />
      <GestureDetector gesture={gesture}>
        <Animated.View
          hitSlop={HIT_SLOP}
          accessibilityRole="button"
          accessibilityLabel="Picture"
          accessibilityState={{ selected }}
          style={[{ width: cardWidth, height: cardHeight }, itemStyle]}
        >
          {uri ? (
            <Image source={{ uri }} resizeMode="cover" style={[styles.image, { borderRadius: radius }]} />
          ) : (
            <View style={[styles.image, styles.placeholder, { borderRadius: radius }]} />
          )}
          {selected ? <View style={styles.selectedOutline} pointerEvents="none" /> : null}
          <Animated.View pointerEvents="none" style={[styles.dragOutline, dragOutlineStyle]} />
        </Animated.View>
      </GestureDetector>
    </View>
  );
});

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
  image: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    backgroundColor: color.whiteA16,
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
