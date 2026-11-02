// TikTok style reel editor over the studio engine: preview with the text
// overlays, play and time, undo and swap, the scrubbable timeline (text
// track above the clip track, trim handles, hold to reorder), the captions bar,
// clip tools when a clip is selected and the Text, Image, Captions, AI
// toolbar. A plug the manager locked (after the hook, at the end) snaps back
// when a reorder moves it out of place; one the creator places moves freely.
// From RLEditor.jsx ReelEditor.
//
// With `onClose` the same editor edits a campaign manager's template over
// the brief screen (V2Editor.jsx EditorScreen): close and the title in the
// header, a Save pill, and with `scripts` a first Script tool that opens the
// teleprompter sheet for the clip under the playhead.
import { useEffect, useRef, useState, type JSX } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Easing, FadeIn, SlideInDown } from 'react-native-reanimated';

import {
  addAsset,
  addOverlay,
  blockAt,
  blockRanges,
  defaultOverlayWindow,
  documentDurationMs,
  MAX_OVERLAYS,
  moveBlock,
  newId,
  splitBlockAt,
  swapCells,
  trimCell,
  type ImageOverlay,
  type MediaAsset,
  type TextOverlay,
  type VideoDocument,
} from '../../../../lib/edit-document';
import type { CtaPlacement } from '../../../../lib/briefs-api';
import { DEFAULT_SHOT_PLACEMENT } from '../../../../lib/media-library-api';
import { CLASSIC_TEXT_COLOR } from '../../../../lib/overlay-boxes';
import { onVideo, useStudioStore } from '../../../../lib/studio-store';
import { color, type as typeToken } from '../../../../theme/tokens';
import { Icon, type IconName } from '../../../ui/Icon';
import { tap } from '../../../v2/haptics';
import { OverlayLane, OverlayLayer } from '../../studio/overlays';
import { beginGesture, selectOverlay, updateGesture } from '../../studio/overlays/overlay-actions';
import { useOverlayUi } from '../../studio/overlays/overlay-ui-store';
import { PicturePickerSheet, type PicturePick } from '../../studio/overlays/PicturePickerSheet';
import { TimelineStrip } from '../../studio/timeline/TimelineStrip';
import { VideoStage } from '../../studio/timeline/VideoStage';
import { AudioChip } from '../../../admin/v2/audio/AudioChip';
import { AudioSheet } from '../../../admin/v2/audio/AudioSheet';
import { CaptionPreview } from '../raw/CaptionPreview';
import type { ReelPlanItem } from './plan';
import { deleteItemBlocks, lockPlug } from './sync';

const TEXT_DEFAULTS = { size: 0.05, x: 0.5, y: 0.3 } as const;
const TRIM_STEP_MS = 1000;
const HINT_MS = 2600;

/** Why the plug clip cannot move, or how to move it. */
function plugHint(place: CtaPlacement): string {
  if (place === 'after_hook') return 'Your plug stays right after the hook. The brief keeps it there.';
  if (place === 'end') return 'Your plug stays at the very end. The brief keeps it there.';
  return 'Hold the plug clip and drag it where it fits.';
}

export type ReelEditorProps = {
  doc: VideoDocument;
  items: ReelPlanItem[];
  companyId: string;
  cuts: number;
  /** Where the plug goes: locked after the hook or at the end, or any (the creator moves it). */
  place: CtaPlacement;
  onBack: () => void;
  /** Next in the creator flow; Save when `onClose` is given. */
  onNext: () => void;
  onAddClip: () => void;
  /** Re record a clip; without it the clip tools have no Redo clip. */
  onRedoClip?: (item: ReelPlanItem) => void;
  /** The AI tool; without it the toolbar has no AI. */
  onAi?: () => void;
  /** Header line in place of the auto cut count. */
  status?: string;
  /** Label under the sparkles tool; AI by default. */
  aiLabel?: string;
  /** Preview captions from the words Edit my video heard. */
  captions?: boolean;
  /** Template editing: close disc and `title` in the header, a Save pill in place of Next. */
  onClose?: () => void;
  title?: string;
  /** Teleprompter text per block id. Present: the toolbar leads with Script and its sheet. */
  scripts?: Record<string, string>;
  onScript?: (blockId: string, text: string) => void;
  /** The brief's sound rule: 'none' hides the Sound tool. */
  soundMode?: 'none' | 'pick' | 'creator' | null;
  /** Talking head posts start a new sound at 25. */
  talkingHead?: boolean;
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

export function MeasuredOverlayLayer({ doc, captions = false }: { doc: VideoDocument; captions?: boolean }): JSX.Element {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none" onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {size && captions ? <CaptionPreview doc={doc} width={size.w} height={size.h} /> : null}
      {size ? <OverlayLayer doc={doc} stageWidth={size.w} stageHeight={size.h} /> : null}
    </View>
  );
}

/** Time, play and pause: the only part of the editor that follows the playhead. */
function Transport({ total, canSwap, onSwap }: { total: number; canSwap: boolean; onSwap: () => void }): JSX.Element {
  const playheadMs = useStudioStore((s) => s.playheadMs);
  const playing = useStudioStore((s) => s.playing);
  const canUndo = useStudioStore((s) => s.past.length > 0);
  const togglePlay = () => {
    if (total === 0) return;
    const store = useStudioStore.getState();
    if (!playing && store.playheadMs >= total) store.setPlayhead(0);
    store.setPlaying(!playing);
  };
  return (
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
      <Pressable accessibilityRole="button" accessibilityLabel="Undo" disabled={!canUndo} onPress={() => useStudioStore.getState().undo()} style={styles.miniBtn}>
        <Icon name="rotate-ccw" size={18} color={canUndo ? color.white : color.whiteA45} />
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Swap" disabled={!canSwap} onPress={onSwap} style={styles.miniBtn}>
        <Icon name="arrow-left-right" size={18} color={canSwap ? color.white : color.whiteA45} />
      </Pressable>
    </View>
  );
}

/** Script tool: blue when the clip under the playhead has a line. Follows the playhead on its own. */
function ScriptTool({ doc, scripts, onPress }: { doc: VideoDocument; scripts: Record<string, string>; onPress: () => void }): JSX.Element {
  const blockId = useStudioStore((s) => blockAt(doc, s.playheadMs)?.block.id ?? null);
  const on = !!(blockId && scripts[blockId]?.trim());
  return <ToolButton icon="captions" label="Script" on={on} dim={!blockId} onPress={onPress} />;
}

/** Dark bottom sheet: "Script for clip n", Teleprompter, a five line field, Done. The clip is the one under the playhead when it opened. */
function ScriptSheet({ doc, scripts, onScript, onClose }: { doc: VideoDocument; scripts: Record<string, string>; onScript: (blockId: string, text: string) => void; onClose: () => void }): JSX.Element {
  const insets = useSafeAreaInsets();
  const [blockId] = useState(() => blockAt(doc, useStudioStore.getState().playheadMs)?.block.id ?? null);
  const n = doc.blocks.findIndex((b) => b.id === blockId) + 1;
  const value = blockId ? (scripts[blockId] ?? '') : '';
  const done = () => {
    tap();
    onClose();
  };
  return (
    <Modal visible transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.sheetWrap}>
        <Animated.View entering={FadeIn.duration(200)} style={StyleSheet.absoluteFill}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={done} style={[StyleSheet.absoluteFill, styles.sheetScrim]} />
        </Animated.View>
        <Animated.View entering={SlideInDown.duration(240).easing(Easing.bezier(0.2, 0.8, 0.2, 1))} style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 20) + 14 }]}>
          <View style={styles.grabber} />
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitle}>Script for clip {n}</Text>
            <Text style={styles.sheetMeta}>Teleprompter</Text>
          </View>
          <TextInput
            autoFocus
            multiline
            value={value}
            onChangeText={(t) => blockId && onScript(blockId, t)}
            placeholder="What the creator reads, word for word"
            placeholderTextColor={color.whiteA45}
            textAlignVertical="top"
            style={styles.scriptInput}
          />
          <Pressable accessibilityRole="button" onPress={done} style={styles.sheetDone}>
            <Text style={styles.sheetDoneText}>Done</Text>
          </Pressable>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Split shows only when the playhead sits inside a clip; mounted only while a clip is selected. */
function SplitTool({ doc }: { doc: VideoDocument }): JSX.Element | null {
  const canSplit = useStudioStore((s) => splitBlockAt(doc, s.playheadMs) !== doc);
  if (!canSplit) return null;
  const split = () => {
    const store = useStudioStore.getState();
    store.commit(onVideo((d) => splitBlockAt(d, store.playheadMs)));
    store.select(null);
  };
  return <ClipTool icon="arrow-left-right" label="Split" onPress={split} />;
}

export function ReelEditor(props: ReelEditorProps): JSX.Element {
  const { doc, items, companyId, cuts, place, onBack, onNext, onAddClip, onRedoClip, onAi, status, aiLabel = 'AI', captions = false, onClose, title = '', scripts, onScript, soundMode = null, talkingHead = false } = props;
  const [soundOpen, setSoundOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const selection = useStudioStore((s) => s.selection);
  const stageRef = useRef<React.ElementRef<typeof VideoStage>>(null);
  const [picking, setPicking] = useState(false);
  const [trim, setTrim] = useState(false);
  const [scriptOpen, setScriptOpen] = useState(false);
  const template = !!onClose;
  const [snapHint, setSnapHint] = useState(false);
  useEffect(() => {
    if (!snapHint) return;
    const t = setTimeout(() => setSnapHint(false), HINT_MS);
    return () => clearTimeout(t);
  }, [snapHint]);
  const total = documentDurationMs(doc);
  const store = useStudioStore.getState();

  const block = selection?.kind === 'block' ? (doc.blocks.find((b) => b.id === selection.blockId) ?? null) : null;
  const cellIndex = selection?.kind === 'block' ? selection.cellIndex : 0;
  const selectedItem = block ? (items.find((p) => p.blockIds.includes(block.id)) ?? null) : null;
  const canSwap = block !== null && block.cells.length === 2;
  const plugSelected = selectedItem?.role === 'cta';

  /** Hold to reorder: a locked plug snaps back to its place, with a short why. */
  const reorder = (blockId: string, to: number) => {
    let snapped = false;
    store.commit(
      onVideo((d) => {
        const moved = moveBlock(d, blockId, to);
        const locked = lockPlug(moved, items, place);
        snapped = locked !== moved;
        return locked.blocks.every((b, k) => b === d.blocks[k]) ? d : locked;
      }),
    );
    if (snapped) setSnapHint(true);
  };
  const canAdd = doc.overlays.length < MAX_OVERLAYS && total > 0;

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
      ...defaultOverlayWindow(doc, useStudioStore.getState().playheadMs),
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
      ...defaultOverlayWindow(doc, useStudioStore.getState().playheadMs),
    };
    store.commit(onVideo((d) => (d.overlays.length >= MAX_OVERLAYS ? d : addOverlay(addAsset(d, asset), overlay))));
    store.setPlayhead(overlay.startMs);
    selectOverlay(overlay.id);
  };

  const toggleCaptions = () => {
    store.commit(onVideo((d) => ({ ...d, subtitles: { ...d.subtitles, enabled: !d.subtitles.enabled } })));
  };

  const confirmDelete = () => {
    if (!block) return;
    Alert.alert('Delete this clip?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          // Plan ids stay; the plan drops dead blocks when it reads them, so undo restores the clip with its text.
          store.commit(onVideo((d) => deleteItemBlocks(d, items, [block.id])));
          store.select(null);
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

  const titleSize = title.length > 40 ? 12 : title.length > 28 ? 13 : 15;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {template ? (
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={() => {
              tap();
              onClose?.();
            }}
            style={styles.headerBtn}
          >
            <Icon name="x" size={22} color={color.white} />
          </Pressable>
          <Text numberOfLines={2} style={[styles.titleText, { fontSize: titleSize }]}>
            {title}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Save"
            onPress={() => {
              tap();
              onNext();
            }}
            style={styles.savePill}
          >
            <Text style={styles.saveText}>Save</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} style={styles.headerBtn}>
            <Icon name="chevron-left" size={22} color={color.white} />
          </Pressable>
          <Text style={styles.headerText}>{status ?? (cuts ? `Auto cut \u00b7 ${cuts} pause${cuts === 1 ? '' : 's'} removed` : 'Auto cut on')}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Next" onPress={onNext} style={[styles.headerBtn, styles.headerNext]}>
            <Icon name="arrow-right" size={22} color={color.white} />
          </Pressable>
        </View>
      )}

      <VideoStage ref={stageRef} doc={doc}>
        <MeasuredOverlayLayer doc={doc} captions={captions} />
        {doc.audio ? <AudioChip audio={doc.audio} onPress={() => { store.setPlaying(false); setSoundOpen(true); }} style={{ position: 'absolute', left: 12, bottom: 12 }} /> : null}
      </VideoStage>

      <Transport total={total} canSwap={canSwap} onSwap={() => block && store.commit(onVideo((d) => swapCells(d, block.id)))} />

      <View style={styles.timeline}>
        {doc.blocks.length === 0 ? (
          <Pressable accessibilityRole="button" onPress={onAddClip} style={styles.emptyClip}>
            <Icon name={template ? 'plus' : 'video'} size={16} color={color.white} />
            <Text style={styles.emptyClipText}>{template ? 'Add clip' : 'Record'}</Text>
          </Pressable>
        ) : (
          <>
            <View style={styles.textLane}>
              <OverlayLane doc={doc} />
            </View>
            <TimelineStrip doc={doc} onReorder={reorder} />
          </>
        )}
        <View style={styles.captionsBar}>
          <Icon name="layout-list" size={13} color={doc.subtitles.enabled ? color.white : color.whiteA45} />
          <Text style={[styles.captionsText, { color: doc.subtitles.enabled ? color.white : color.whiteA45 }]}>
            {doc.subtitles.enabled ? 'Captions \u00b7 auto from your audio' : 'Captions off'}
          </Text>
        </View>
      </View>

      {snapHint || plugSelected ? (
        <View style={styles.hint} pointerEvents="none">
          <Icon name="zap" size={13} color={color.blue300} />
          <Text style={styles.hintText}>{plugHint(place)}</Text>
        </View>
      ) : null}

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
          <SplitTool doc={doc} />
          <ClipTool icon="clock" label="Trim" onPress={() => setTrim(true)} />
          {selectedItem && onRedoClip ? <ClipTool icon="video" label="Redo clip" onPress={() => onRedoClip(selectedItem)} /> : null}
          {template && doc.blocks.length < 2 ? null : <ClipTool icon="trash-2" label="Delete" onPress={confirmDelete} />}
        </ScrollView>
      ) : (
        <View style={[styles.toolbar, { paddingBottom: insets.bottom + 8 }]}>
          {scripts && onScript ? (
            <ScriptTool
              doc={doc}
              scripts={scripts}
              onPress={() => {
                tap();
                store.setPlaying(false);
                setScriptOpen(true);
              }}
            />
          ) : null}
          <ToolButton icon="pencil" label="Text" dim={!canAdd} onPress={addText} />
          <ToolButton icon="image-plus" label="Image" dim={!canAdd} onPress={() => { store.setPlaying(false); setPicking(true); }} />
          {soundMode !== 'none' ? <ToolButton icon="music-2" label="Sound" on={!!doc.audio} dim={total === 0} onPress={() => { tap(); store.setPlaying(false); setSoundOpen(true); }} /> : null}
          <ToolButton icon="layout-list" label="Captions" on={doc.subtitles.enabled} onPress={toggleCaptions} />
          {onAi ? <ToolButton icon="sparkles" label={aiLabel} onPress={onAi} /> : null}
        </View>
      )}

      {picking ? <PicturePickerSheet companyId={companyId} onPick={addPicture} onClose={() => setPicking(false)} /> : null}
      <AudioSheet
        open={soundOpen}
        onClose={() => setSoundOpen(false)}
        len={Math.max(1, Math.round(total / 1000))}
        value={doc.audio ?? null}
        defaultVol={talkingHead ? 25 : 100}
        onChange={(v) => store.commit(onVideo((d) => ({ ...d, audio: v })))}
        onRemove={() => store.commit(onVideo((d) => ({ ...d, audio: null })))}
      />
      {scriptOpen && scripts && onScript ? <ScriptSheet doc={doc} scripts={scripts} onScript={onScript} onClose={() => setScriptOpen(false)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.ink900 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 6 },
  headerBtn: { width: 44, height: 44, borderRadius: 999, backgroundColor: color.whiteA16, alignItems: 'center', justifyContent: 'center' },
  headerNext: { backgroundColor: color.blue500 },
  headerText: { flex: 1, textAlign: 'center', fontFamily: typeToken.font.ui, fontSize: 13, fontWeight: '700', color: color.whiteA60 },
  titleText: { flex: 1, minWidth: 0, marginHorizontal: 8, fontFamily: typeToken.font.ui, fontWeight: '600', lineHeight: 18, color: color.white },
  savePill: { height: 36, paddingHorizontal: 16, borderRadius: 999, backgroundColor: color.blue500, alignItems: 'center', justifyContent: 'center' },
  saveText: { fontFamily: typeToken.font.ui, fontSize: 14, fontWeight: '700', color: color.white },
  sheetWrap: { flex: 1, justifyContent: 'flex-end' },
  sheetScrim: { backgroundColor: color.scrimStrong },
  sheet: { backgroundColor: color.ink800, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 16, paddingTop: 10 },
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: color.whiteA28, marginBottom: 10 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sheetTitle: { fontFamily: typeToken.font.ui, fontSize: 15, lineHeight: 20, fontWeight: '700', color: color.white },
  sheetMeta: { fontFamily: typeToken.font.ui, fontSize: 12, lineHeight: 16, fontWeight: '500', color: color.whiteA60 },
  scriptInput: { height: 144, borderRadius: 14, backgroundColor: color.whiteA16, color: color.white, paddingHorizontal: 14, paddingVertical: 12, fontFamily: typeToken.font.ui, fontSize: 17, lineHeight: 24, fontWeight: '600' },
  sheetDone: { marginTop: 12, height: 48, borderRadius: 999, backgroundColor: color.white, alignItems: 'center', justifyContent: 'center' },
  sheetDoneText: { fontFamily: typeToken.font.ui, fontSize: 15, fontWeight: '700', color: color.ink },
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
  hint: { marginHorizontal: 16, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12, backgroundColor: color.ink800 },
  hintText: { flex: 1, fontFamily: typeToken.font.ui, fontSize: 12.5, fontWeight: '600', color: color.whiteA75 },
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
