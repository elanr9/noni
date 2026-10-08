// Image cells are not in the native composition: for the block under the
// playhead, draw each image asset into its cell rect over the player.
import type { JSX } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { assetById, blockAt, type VideoDocument } from '../../../../lib/edit-document';
import { useStudioStore } from '../../../../lib/studio-store';
import { cellRect } from './geometry';

export function ImageCells(props: {
  doc: VideoDocument;
  stageWidth: number;
  stageHeight: number;
}): JSX.Element | null {
  const { doc, stageWidth, stageHeight } = props;
  const blockId = useStudioStore((s) => blockAt(doc, s.playheadMs)?.block.id ?? null);
  const block = blockId ? doc.blocks.find((b) => b.id === blockId) : undefined;
  if (!block) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {block.cells.map((cell, index) => {
        const asset = assetById(doc, cell.assetId);
        if (asset?.kind !== 'image' || !asset.localUri) return null;
        const rect = cellRect(block.layout, index, stageWidth, stageHeight);
        const crop = cell.crop ?? { scale: 1, x: 0, y: 0 };
        return (
          <View
            key={cell.id}
            style={{
              position: 'absolute',
              left: rect.x,
              top: rect.y,
              width: rect.width,
              height: rect.height,
              overflow: 'hidden',
              backgroundColor: '#000',
            }}
          >
            <Image
              source={{ uri: asset.localUri }}
              resizeMode="cover"
              fadeDuration={0}
              style={[
                StyleSheet.absoluteFill,
                {
                  transform: [
                    { translateX: crop.x * rect.width },
                    { translateY: crop.y * rect.height },
                    { scale: crop.scale },
                  ],
                },
              ]}
            />
          </View>
        );
      })}
    </View>
  );
}
