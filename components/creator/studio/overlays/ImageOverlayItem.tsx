// One picture pop-up on the stage: centred at (x, y), `width` of the frame
// wide, aspect from the asset, rounded corners.
import { memo, type JSX } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';
import { useVideoPlayer, VideoView } from 'expo-video';

import { updateOverlay, type ImageOverlay, type MediaAsset } from '../../../../lib/edit-document';
import { IMAGE_CORNER_RADIUS, MAX_IMAGE_WIDTH, MIN_IMAGE_WIDTH } from './geometry';
import { applyGesture, confirmDeleteOverlay, selectOverlay } from './overlay-actions';
import { useOverlayImage } from './useOverlayImage';
import { useStageGesture } from './useStageGesture';
import { color, editor } from '../../../../theme/v2';

const HIT_SLOP = 14;
/** A phone screen recording is about this wide for its height. */
const CLIP_ASPECT = 0.46;

/** A feature screen recording: muted, looping, under the same frame as a picture. */
function OverlayClip({ uri, radius }: { uri: string; radius: number }): JSX.Element {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });
  return <VideoView player={player} nativeControls={false} contentFit="cover" style={[styles.image, { borderRadius: radius, overflow: 'hidden' }]} pointerEvents="none" />;
}

export type ImageOverlayItemProps = {
  overlay: ImageOverlay;
  asset: MediaAsset | null;
  stageWidth: number;
  stageHeight: number;
  selected: boolean;
};

export const ImageOverlayItem = memo(function ImageOverlayItem(props: ImageOverlayItemProps): JSX.Element {
  const { overlay, asset, stageWidth, stageHeight, selected } = props;
  const { uri, aspect: measured } = useOverlayImage(asset);
  const clip = asset?.kind === 'video';
  const aspect = clip && !(asset?.width && asset?.height) ? CLIP_ASPECT : measured;
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
          {uri && clip ? (
            <OverlayClip uri={uri} radius={radius} />
          ) : uri ? (
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
    backgroundColor: editor.w45,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    backgroundColor: editor.w16,
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
    borderColor: editor.w75,
    borderStyle: 'dashed',
  },
});
