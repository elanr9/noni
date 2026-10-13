// TikTok style reel editor over the studio engine: preview with the text
// overlays, play and time, undo and swap, the scrubbable timeline (text
// track above the clip track, trim handles, hold to reorder), the captions bar,
// clip tools when a clip is selected and the Text, Image, Captions, AI
// toolbar. From RLEditor.jsx ReelEditor.
import { useRef, useState, type JSX } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  addAsset,
  addOverlay,
  blockRanges,
  defaultOverlayWindow,
  deleteBlock,
  documentDurationMs,
  MAX_OVERLAYS,
  newId,
  splitBlockAt,
  swapCells,
  trimCell,
  type ImageOverlay,
  type MediaAsset,
  type TextOverlay,
  type VideoDocument,
} from '../../../../lib/edit-document';
import { DEFAULT_SHOT_PLACEMENT } from '../../../../lib/media-library-api';
import { CLASSIC_TEXT_COLOR } from '../../../../lib/overlay-boxes';
import { onVideo, useStudioStore } from '../../../../lib/studio-store';
import { color, type as typeToken } from '../../../../theme/tokens';
import { Icon, type IconName } from '../../../ui/Icon';
import { OverlayLane, OverlayLayer } from '../../studio/overlays';
import { beginGesture, selectOverlay, updateGesture } from '../../studio/overlays/overlay-actions';
import { useOverlayUi } from '../../studio/overlays/overlay-ui-store';
import { PicturePickerSheet, type PicturePick } from '../../studio/overlays/PicturePickerSheet';
import { TimelineStrip } from '../../studio/timeline/TimelineStrip';
import { VideoStage } from '../../studio/timeline/VideoStage';
import type { ReelPlanItem } from './plan';

const TEXT_DEFAULTS = { size: 0.05, x: 0.5, y: 0.3 } as const;
const TRIM_STEP_MS = 1000;

export type ReelEditorProps = {
  doc: VideoDocument;
  items: ReelPlanItem[];
  companyId: string;
  cuts: number;
  onBack: () => void;
  onNext: () => void;
  onAddClip: () => void;
  onRedoClip: (item: ReelPlanItem) => void;
  onDeleteBlock: (blockId: string) => void;
  onAi: () => void;
};

function fmt(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function ToolButton({ icon, label, on = false, dim = false, onPress }: { icon: IconName; label: string; on?: boolean; dim?: boolean; onPress: () => void }): JSX.Element {
  const fg = on ? color.blue300 : dim ? color.whiteA28 : color.white;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: dim, selected: on }} disabled={dim} onPress={onPress} style={styles.tool}>
      <Icon name={icon} size={22} color={fg} />
      <Text style={[styles.toolText, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

function ClipTool({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }): JSX.Element {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.clipTool}>
      <Icon name={icon} size={21} color={color.white} />
      <Text style={styles.clipToolText}>{label}</Text>
    </Pressable>
  );
}

function MeasuredOverlayLayer({ doc }: { doc: VideoDocument }): JSX.Element {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none" onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {size ? <OverlayLayer doc={doc} stageWidth={size.w} stageHeight={size.h} /> : null}
    </View>
  );
}

export function ReelEditor(props: ReelEditorProps): JSX.Element {
  const { doc, items, companyId, cuts, onBack, onNext, onAddClip, onRedoClip, onDeleteBlock, onAi } = props;
  const insets = useSafeAreaInsets();
  const playheadMs = useStudioStore((s) => s.playheadMs);
  const playing = useStudioStore((s) => s.playing);
  const selection = useStudioStore((s) => s.selection);
  const canUndo = useStudioStore((s) => s.past.length > 0);
  const stageRef = useRef<React.ElementRef<typeof VideoStage>>(null);
  const [picking, setPicking] = useState(false);
  const [trim, setTrim] = useState(false);
  const total = documentDurationMs(doc);
  const store = useStudioStore.getState();

  const block = selection?.kind === 'block' ? (doc.blocks.find((b) => b.id === selection.blockId) ?? null) : null;
  const cellIndex = selection?.kind === 'block' ? selection.cellIndex : 0;
  const selectedItem = block ? (items.find((p) => p.blockIds.includes(block.id)) ?? null) : null;
  const canSplit = splitBlockAt(doc, playheadMs) !== doc;
  const canSwap = block !== null && block.cells.length === 2;
  const canAdd = doc.overlays.length < MAX_OVERLAYS && total > 0;

  const togglePlay = () => {
    if (total === 0) return;
    if (!playing && playheadMs >= total) store.setPlayhead(0);
    store.setPlaying(!playing);
  };

  const addText = () => {
    if (!canAdd) return;
    store.setPlaying(false);
    const overlay: TextOverlay = {
      kind: 'text',
      id: newId('o'),
      text: '',
      color: CLASSIC_TEXT_COLOR,
      bg: false,
      ...TEXT_DEFAULTS,
      ...defaultOverlayWindow(doc, store.playheadMs),
    };
    beginGesture();
    updateGesture((d) => addOverlay(d, overlay));
    store.setPlayhead(overlay.startMs);
    selectOverlay(overlay.id);
    useOverlayUi.getState().openEditor(overlay.id);
  };

  const addPicture = (pick: PicturePick) => {
    setPicking(false);
    const asset: MediaAsset = {
      id: newId('a'),
      kind: 'image',
      localUri: pick.localUri,
      storagePath: pick.storagePath,
      durationMs: null,
      width: pick.width,
      height: pick.height,
    };
    const overlay: ImageOverlay = {
      kind: 'image',
      id: newId('o'),
      assetId: asset.id,
      x: DEFAULT_SHOT_PLACEMENT.x,
      y: DEFAULT_SHOT_PLACEMENT.y,
      width: DEFAULT_SHOT_PLACEMENT.w,
      ...defaultOverlayWindow(doc, store.playheadMs),
    };
    store.commit(onVideo((d) => (d.overlays.length >= MAX_OVERLAYS ? d : addOverlay(addAsset(d, asset), overlay))));
    store.setPlayhead(overlay.startMs);
    selectOverlay(overlay.id);
  };

  const toggleCaptions = () => {
    store.commit(onVideo((d) => ({ ...d, subtitles: { ...d.subtitles, enabled: !d.subtitles.enabled } })));
  };

  const split = () => {
    store.commit(onVideo((d) => splitBlockAt(d, playheadMs)));
    store.select(null);
  };
  const confirmDelete = () => {
    if (!block) return;
    Alert.alert('Delete this clip?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          store.commit(onVideo((d) => deleteBlock(d, block.id)));
          store.select(null);
          onDeleteBlock(block.id);
        },
      },
    ]);
  };
  const trimBy = (delta: number) => {
    if (!block) return;
    store.commit(onVideo((d) => trimCell(d, block.id, cellIndex, 'out', delta)));
  };
  const range = block ? (blockRanges(doc).find((r) => r.block.id === block.id) ?? null) : null;
  const selectedMs = range ? Math.round((range.endMs - range.startMs) / 1000) : 0;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} style={styles.headerBtn}>
          <Icon name="chevron-left" size={22} color={color.white} />
        </Pressable>
        <Text style={styles.headerText}>{cuts ? `Auto cut \u00b7 ${cuts} pause${cuts === 1 ? '' : 's'} removed` : 'Auto cut on'}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Next" onPress={onNext} style={[styles.headerBtn, styles.headerNext]}>
          <Icon name="arrow-right" size={22} color={color.white} />
        </Pressable>
      </View>

      <VideoStage ref={stageRef} doc={doc}>
        <MeasuredOverlayLayer doc={doc} />
      </VideoStage>

      <View style={styles.transport}>
        <Text style={styles.time}>
          {fmt(playheadMs)}
          <Text style={styles.timeTotal}>/{fmt(total)}</Text>
        </Text>
        <View style={styles.flexCenter}>
          <Pressable accessibilityRole="button" accessibilityLabel={playing ? 'Pause' : 'Play'} onPress={togglePlay} style={styles.playBtn}>
            <Icon name={playing ? 'pause' : 'play'} size={22} color={color.white} />
          </Pressable>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Undo" disabled={!canUndo} onPress={() => store.undo()} style={styles.miniBtn}>
          <Icon name="rotate-ccw" size={18} color={canUndo ? color.white : color.whiteA45} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Swap"
          disabled={!canSwap}
          onPress={() => block && store.commit(onVideo((d) => swapCells(d, block.id)))}
          style={styles.miniBtn}
        >
          <Icon name="arrow-left-right" size={18} color={canSwap ? color.white : color.whiteA45} />
        </Pressable>
      </View>

      <View style={styles.timeline}>
        {doc.blocks.length === 0 ? (
          <Pressable accessibilityRole="button" onPress={onAddClip} style={styles.emptyClip}>
            <Icon name="video" size={16} color={color.white} />
            <Text style={styles.emptyClipText}>Record</Text>
          </Pressable>
        ) : (
          <>
            <View style={styles.textLane}>
              <OverlayLane doc={doc} />
            </View>
            <TimelineStrip doc={doc} />
          </>
        )}
        <View style={styles.captionsBar}>
          <Icon name="layout-list" size={13} color={doc.subtitles.enabled ? color.white : color.whiteA45} />
          <Text style={[styles.captionsText, { color: doc.subtitles.enabled ? color.white : color.whiteA45 }]}>
            {doc.subtitles.enabled ? 'Captions \u00b7 auto from your audio' : 'Captions off'}
          </Text>
        </View>
      </View>

      {trim && block ? (
        <View style={styles.trimBar}>
          <Text style={styles.trimLabel}>Clip length</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Shorter" onPress={() => trimBy(-TRIM_STEP_MS)} style={styles.trimBtn}>
            <Text style={styles.trimSign}>-</Text>
          </Pressable>
          <Text style={styles.trimValue}>{selectedMs}s</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Longer" onPress={() => trimBy(TRIM_STEP_MS)} style={styles.trimBtn}>
            <Text style={styles.trimSign}>+</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => setTrim(false)} style={styles.trimDone}>
            <Text style={styles.trimDoneText}>Done</Text>
          </Pressable>
        </View>
      ) : null}

      {block ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.clipTools, { paddingBottom: insets.bottom + 10 }]} style={styles.clipToolsScroll}>
          <Pressable accessibilityRole="button" accessibilityLabel="Done" onPress={() => { store.select(null); setTrim(false); }} style={styles.clipDone}>
            <Icon name="chevron-down" size={20} color={color.white} />
          </Pressable>
          {canSplit ? <ClipTool icon="arrow-left-right" label="Split" onPress={split} /> : null}
          <ClipTool icon="clock" label="Trim" onPress={() => setTrim(true)} />
          {selectedItem ? <ClipTool icon="video" label="Redo clip" onPress={() => onRedoClip(selectedItem)} /> : null}
          <ClipTool icon="trash-2" label="Delete" onPress={confirmDelete} />
        </ScrollView>
      ) : (
        <View style={[styles.toolbar, { paddingBottom: insets.bottom + 8 }]}>
          <ToolButton icon="pencil" label="Text" dim={!canAdd} onPress={addText} />
          <ToolButton icon="image-plus" label="Image" dim={!canAdd} onPress={() => { store.setPlaying(false); setPicking(true); }} />
          <ToolButton icon="layout-list" label="Captions" on={doc.subtitles.enabled} onPress={toggleCaptions} />
          <ToolButton icon="sparkles" label="AI" onPress={onAi} />
        </View>
      )}

      {picking ? <PicturePickerSheet companyId={companyId} onPick={addPicture} onClose={() => setPicking(false)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.ink900 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 6 },
  headerBtn: { width: 44, height: 44, borderRadius: 999, backgroundColor: color.whiteA16, alignItems: 'center', justifyContent: 'center' },
  headerNext: { backgroundColor: color.blue500 },
  headerText: { flex: 1, textAlign: 'center', fontFamily: typeToken.font.ui, fontSize: 13, fontWeight: '700', color: color.whiteA60 },
  transport: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 2 },
  time: { fontFamily: typeToken.font.ui, fontSize: 13, fontWeight: '600', color: color.white, fontVariant: ['tabular-nums'] },
  timeTotal: { color: color.whiteA45 },
  flexCenter: { flex: 1, alignItems: 'center' },
  playBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  miniBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  timeline: { flex: 1, minHeight: 0, justifyContent: 'flex-start' },
  textLane: { minHeight: 26, marginBottom: 4, overflow: 'hidden' },
  emptyClip: { alignSelf: 'center', marginTop: 28, width: 120, height: 56, borderRadius: 8, borderWidth: 1.5, borderStyle: 'dashed', borderColor: color.whiteA45, backgroundColor: color.whiteA16, alignItems: 'center', justifyContent: 'center', gap: 2 },
  emptyClipText: { fontFamily: typeToken.font.ui, fontSize: 10.5, fontWeight: '700', color: color.white },
  captionsBar: { marginHorizontal: 16, marginTop: 6, height: 30, paddingHorizontal: 10, borderRadius: 6, backgroundColor: color.whiteA16, flexDirection: 'row', alignItems: 'center', gap: 8 },
  captionsText: { fontFamily: typeToken.font.ui, fontSize: 11.5, fontWeight: '700' },
  trimBar: { marginHorizontal: 12, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 14, backgroundColor: color.ink800 },
  trimLabel: { flex: 1, fontFamily: typeToken.font.ui, fontSize: 13, fontWeight: '700', color: color.white },
  trimBtn: { width: 44, height: 44, borderRadius: 999, borderWidth: 1, borderColor: color.whiteA28, alignItems: 'center', justifyContent: 'center' },
  trimSign: { fontFamily: typeToken.font.ui, fontSize: 20, fontWeight: '600', color: color.white },
  trimValue: { minWidth: 36, textAlign: 'center', fontFamily: typeToken.font.display, fontSize: 18, fontWeight: '800', color: color.white },
  trimDone: { height: 44, paddingHorizontal: 14, borderRadius: 999, backgroundColor: color.white, justifyContent: 'center' },
  trimDoneText: { fontFamily: typeToken.font.ui, fontSize: 13, fontWeight: '700', color: color.ink },
  clipToolsScroll: { flexGrow: 0 },
  clipTools: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingTop: 8 },
  clipDone: { width: 52, height: 68, borderRadius: 14, backgroundColor: color.whiteA16, alignItems: 'center', justifyContent: 'center' },
  clipTool: { width: 68, height: 68, borderRadius: 14, backgroundColor: color.whiteA16, alignItems: 'center', justifyContent: 'center', gap: 6 },
  clipToolText: { fontFamily: typeToken.font.ui, fontSize: 11.5, fontWeight: '600', color: color.white },
  toolbar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingTop: 4 },
  tool: { flex: 1, alignItems: 'center', gap: 5, paddingVertical: 8, minHeight: 44 },
  toolText: { fontFamily: typeToken.font.ui, fontSize: 11, fontWeight: '600' },
});
