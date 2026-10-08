import { useState, type JSX } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import type { OverlayBox } from '../../../../lib/overlay-boxes';
import { color } from '../../../../theme/tokens';
import { SkeletonCard } from '../../../ui/Skeleton';
import { CropPhoto } from '../../slides/CropPhoto';
import { photoLayout, type PhotoCrop, type SourceSize } from '../../slides/photo-crop';
import { TikTokChrome } from '../../slides/TikTokChrome';
import { BoxLayer, type BoxEditing } from './BoxLayer';

export function SlideCanvas(props: {
  uri: string | null;
  crop: PhotoCrop | null;
  source: SourceSize | null;
  frameAspect: number;
  chrome: boolean;
  boxes: OverlayBox[];
  editing: BoxEditing;
  /** Set while the creator frames the photo; the photo then takes every touch. */
  onCropChange: ((crop: PhotoCrop) => void) | null;
}): JSX.Element {
  const { uri, crop, source, frameAspect, chrome, boxes, editing, onCropChange } = props;
  const [stage, setStage] = useState({ w: 0, h: 0 });
  const [loadedUri, setLoadedUri] = useState<string | null>(null);
  const ready = stage.w > 0 && stage.h > 0;

  return (
    <View
      style={styles.root}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (width > 0 && height > 0) setStage({ w: width, h: height });
      }}
    >
      {uri !== null && ready && onCropChange !== null && crop !== null && source !== null ? (
        <CropPhoto
          uri={uri}
          crop={crop}
          source={source}
          frameAspect={frameAspect}
          stageWidth={stage.w}
          stageHeight={stage.h}
          onChange={onCropChange}
          onLoad={() => setLoadedUri(uri)}
        />
      ) : uri !== null && ready ? (
        <Image
          source={{ uri }}
          style={crop !== null ? [styles.photo, photoLayout(crop, stage.w, stage.h)] : StyleSheet.absoluteFill}
          resizeMode={crop !== null ? 'stretch' : 'cover'}
          onLoad={() => setLoadedUri(uri)}
        />
      ) : null}
      {uri === null || loadedUri !== uri ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <SkeletonCard radius={0} style={styles.shimmer} />
        </View>
      ) : null}

      {chrome ? <TikTokChrome stageWidth={stage.w} stageHeight={stage.h} /> : null}

      <BoxLayer
        boxes={boxes}
        stageWidth={stage.w}
        stageHeight={stage.h}
        editing={editing}
        interactive={onCropChange === null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: color.ink900,
  },
  photo: {
    position: 'absolute',
  },
  shimmer: {
    flex: 1,
    opacity: 0.35,
  },
});
