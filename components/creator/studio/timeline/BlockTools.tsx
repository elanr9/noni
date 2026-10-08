// Tool row under the strip: undo, redo and add clip always; block tools
// while a block is selected. Discrete edits commit straight to the store.
import type { JSX } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import {
  deleteBlock,
  duplicateBlock,
  splitBlockAt,
  swapCells,
  updateCell,
  MAX_BLOCKS,
  type VideoDocument,
} from '../../../../lib/edit-document';
import { onVideo, useStudioStore } from '../../../../lib/studio-store';
import { color } from '../../../../theme/tokens';
import { ToolTile } from './ToolTile';

export type ToolPanelId = 'speed' | 'layout';

export function BlockTools(props: {
  doc: VideoDocument;
  onAddClip: () => void;
  onOpen: (panel: ToolPanelId) => void;
}): JSX.Element {
  const { doc, onAddClip, onOpen } = props;
  const selection = useStudioStore((s) => s.selection);
  const canUndo = useStudioStore((s) => s.past.length > 0);
  const canRedo = useStudioStore((s) => s.future.length > 0);
  const canSplit = useStudioStore(
    (s) => s.document?.format === 'video' && splitBlockAt(s.document, s.playheadMs) !== s.document,
  );
  const { commit, undo, redo, select } = useStudioStore.getState();

  const block = selection?.kind === 'block' ? (doc.blocks.find((b) => b.id === selection.blockId) ?? null) : null;
  const cellIndex = selection?.kind === 'block' ? selection.cellIndex : 0;
  const cell = block?.cells[cellIndex] ?? null;

  const confirmDelete = () => {
    if (!block) return;
    Alert.alert('Delete this clip?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          commit(onVideo((d) => deleteBlock(d, block.id)));
          select(null);
        },
      },
    ]);
  };

  return (
    <View style={styles.row}>
      <View style={styles.history}>
        <ToolTile label="Undo" icon="undo-2" enabled={canUndo} onPress={undo} />
        <ToolTile label="Redo" icon="redo-2" enabled={canRedo} onPress={redo} />
      </View>
      <View style={styles.divider} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tools}>
        <ToolTile label="Add clip" icon="plus" enabled={doc.blocks.length < MAX_BLOCKS} onPress={onAddClip} />
        {block && cell ? (
          <>
            <ToolTile
              label="Split"
              icon="scissors"
              enabled={canSplit}
              onPress={() => commit(onVideo((d) => splitBlockAt(d, useStudioStore.getState().playheadMs)))}
            />
            <ToolTile label="Speed" icon="gauge" onPress={() => onOpen('speed')} active={cell.speed !== 1} />
            <ToolTile
              label={cell.muted ? 'Unmute' : 'Mute'}
              icon={cell.muted ? 'volume-x' : 'volume-2'}
              active={cell.muted}
              onPress={() => commit(onVideo((d) => updateCell(d, block.id, cellIndex, { muted: !cell.muted })))}
            />
            <ToolTile label="Layout" icon="layout-list" onPress={() => onOpen('layout')} active={block.layout !== 'single'} />
            {block.cells.length === 2 ? (
              <ToolTile
                label="Swap"
                icon="arrow-left-right"
                onPress={() => commit(onVideo((d) => swapCells(d, block.id)))}
              />
            ) : null}
            <ToolTile
              label="Duplicate"
              icon="repeat"
              enabled={doc.blocks.length < MAX_BLOCKS}
              onPress={() => commit(onVideo((d) => duplicateBlock(d, block.id)))}
            />
            <ToolTile label="Delete" icon="trash-2" onPress={confirmDelete} />
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 },
  history: { flexDirection: 'row', gap: 6 },
  divider: { width: 1, height: 44, marginHorizontal: 8, backgroundColor: color.whiteA16 },
  tools: { gap: 6, paddingRight: 12 },
});
