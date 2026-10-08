// Poster frames inside one cell's source range; image cells tile the picture.
import { memo, type JSX } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import type { Clip, MediaAsset } from '../../../../lib/edit-document';
import { color } from '../../../../theme/tokens';
import { useAssetFrames } from './useAssetFrames';

export const BlockThumbs = memo(function BlockThumbs(props: {
  asset: MediaAsset | null;
  clip: Clip;
  width: number;
  height: number;
  msPerPx: number;
}): JSX.Element | null {
  const { asset, clip, width, height, msPerPx } = props;
  const { frames, frameIntervalMs } = useAssetFrames(asset);

  if (asset?.kind === 'image') {
    if (!asset.localUri) return null;
    const count = Math.max(1, Math.ceil(width / height));
    return (
      <View style={styles.row} pointerEvents="none">
        {Array.from({ length: count }, (_, k) => (
          <Image
            key={k}
            source={{ uri: asset.localUri ?? '' }}
            resizeMode="cover"
            fadeDuration={0}
            style={{ width: height, height }}
          />
        ))}
      </View>
    );
  }

  if (frames.length === 0) return null;
  const frameWidth = frameIntervalMs / clip.speed / msPerPx;
  const firstFrame = Math.floor(clip.inMs / frameIntervalMs);
  const lastFrame = Math.ceil(clip.outMs / frameIntervalMs);
  const shift = (clip.inMs % frameIntervalMs) / clip.speed / msPerPx;
  const frameCount = Math.max(0, lastFrame - firstFrame);

  return (
    <View style={[styles.row, { left: -shift }]} pointerEvents="none">
      {Array.from({ length: frameCount }, (_, k) => {
        const uri = frames[firstFrame + k] ?? '';
        return uri.length > 0 ? (
          <Image
            key={firstFrame + k}
            source={{ uri }}
            resizeMode="cover"
            fadeDuration={0}
            style={{ width: frameWidth, height }}
          />
        ) : (
          <View key={firstFrame + k} style={[styles.empty, { width: frameWidth, height }]} />
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  row: { position: 'absolute', top: 0, left: 0, flexDirection: 'row' },
  empty: { backgroundColor: color.ink800 },
});
