// Everything popped over the video at the playhead: text boxes and pictures,
// each its own gesture, plus the edit sheet for the text being edited.
import { memo, type JSX } from 'react';
import { StyleSheet, View } from 'react-native';

import { assetById, overlaysAt, type VideoDocument } from '../../../../lib/edit-document';
import { useStudioStore } from '../../../../lib/studio-store';
import { ImageOverlayItem } from './ImageOverlayItem';
import { useOverlayUi } from './overlay-ui-store';
import { TextEditSheet } from './TextEditSheet';
import { TextOverlayItem } from './TextOverlayItem';

export type OverlayLayerProps = {
  doc: VideoDocument;
  stageWidth: number;
  stageHeight: number;
};

export const OverlayLayer = memo(function OverlayLayer(props: OverlayLayerProps): JSX.Element {
  const { doc, stageWidth, stageHeight } = props;
  const playheadMs = useStudioStore((s) => s.playheadMs);
  const selection = useStudioStore((s) => s.selection);
  const editingId = useOverlayUi((s) => s.editingOverlayId);
  const selectedId = selection?.kind === 'overlay' ? selection.overlayId : null;
  const editing = doc.overlays.find((o) => o.id === editingId);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {overlaysAt(doc, playheadMs).map((overlay) =>
        overlay.kind === 'text' ? (
          <TextOverlayItem
            key={overlay.id}
            overlay={overlay}
            stageWidth={stageWidth}
            stageHeight={stageHeight}
            selected={overlay.id === selectedId}
          />
        ) : (
          <ImageOverlayItem
            key={overlay.id}
            overlay={overlay}
            asset={assetById(doc, overlay.assetId)}
            stageWidth={stageWidth}
            stageHeight={stageHeight}
            selected={overlay.id === selectedId}
          />
        ),
      )}
      {editing?.kind === 'text' ? <TextEditSheet key={editing.id} overlay={editing} /> : null}
    </View>
  );
});
