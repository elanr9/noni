// Strip plus tools. Owns which picker is open; everything else lives in
// the studio store.
import { useState, type JSX, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  setBlockLayout,
  setCellSpeed,
  type BlockLayout,
  type MediaAsset,
  type VideoDocument,
} from '../../../../lib/edit-document';
import { onVideo, useStudioStore } from '../../../../lib/studio-store';
import { color, type } from '../../../../theme/tokens';
import { BlockTools, type ToolPanelId } from './BlockTools';
import { LayoutPicker } from './LayoutPicker';
import { SecondClipPicker } from './SecondClipPicker';
import { SpeedPicker } from './SpeedPicker';
import { TimelineStrip } from './TimelineStrip';

export type TimelineEditorProps = {
  doc: VideoDocument;
  /** Rendered under the clip strip inside the scrolled content, same scale. */
  overlayLane?: ReactNode;
  onAddClip: () => void;
};

type Panel = { kind: ToolPanelId } | { kind: 'second'; layout: BlockLayout } | null;

export function TimelineEditor(props: TimelineEditorProps): JSX.Element {
  const { doc, overlayLane, onAddClip } = props;
  const [panel, setPanel] = useState<Panel>(null);
  const selection = useStudioStore((s) => s.selection);
  const commit = useStudioStore((s) => s.commit);

  const block = selection?.kind === 'block' ? (doc.blocks.find((b) => b.id === selection.blockId) ?? null) : null;
  const cellIndex = selection?.kind === 'block' ? selection.cellIndex : 0;
  const cell = block?.cells[cellIndex] ?? null;
  const open = block && cell ? panel : null;
  const close = () => setPanel(null);

  const chooseLayout = (layout: BlockLayout) => {
    if (!block) return;
    if (layout === 'single' || block.cells.length === 2) {
      commit(onVideo((d) => setBlockLayout(d, block.id, layout, null)));
      close();
      return;
    }
    setPanel({ kind: 'second', layout });
  };

  const chooseSecond = (layout: BlockLayout, asset: MediaAsset) => {
    if (!block) return;
    commit(onVideo((d) => setBlockLayout(d, block.id, layout, asset)));
    close();
  };

  return (
    <View style={styles.root}>
      {doc.blocks.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Add a clip to start cutting</Text>
        </View>
      ) : (
        <TimelineStrip doc={doc} overlayLane={overlayLane} />
      )}
      <View style={styles.tools}>
        {open?.kind === 'speed' && block && cell ? (
          <SpeedPicker
            value={cell.speed}
            onChange={(speed) => commit(onVideo((d) => setCellSpeed(d, block.id, cellIndex, speed)))}
            onClose={close}
          />
        ) : open?.kind === 'layout' && block ? (
          <LayoutPicker value={block.layout} onChange={chooseLayout} onClose={close} />
        ) : open?.kind === 'second' ? (
          <SecondClipPicker
            doc={doc}
            title={open.layout === 'split_v' ? 'Clip for the bottom' : 'Clip for the right'}
            onPick={(asset) => chooseSecond(open.layout, asset)}
            onClose={close}
          />
        ) : (
          <BlockTools doc={doc} onAddClip={onAddClip} onOpen={(kind) => setPanel({ kind })} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: '#000', paddingTop: 10, paddingBottom: 12, gap: 12 },
  empty: { height: 80, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: color.whiteA60, fontSize: type.size.meta, fontWeight: type.weight.medium },
  tools: { minHeight: 76, justifyContent: 'center' },
});
