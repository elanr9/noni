// Creator video editor: the last stop before a video post goes to review.
// Owns the edit history, the preview playhead and the open tool; the record
// screen owns the clips, persistence, re-records and the final export.
import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';

import type { BriefSegment, TextOverlay } from '../../../lib/briefs-api';
import {
  EDIT_SPEEDS,
  canSplitAt,
  clampSpeed,
  deletePiece,
  formatClock,
  formatSeconds,
  pieceAt,
  pieceDurationMs,
  pieceRanges,
  setAllMuted,
  slotPieces,
  splitAt,
  timelineDurationMs,
  trimPiece,
  updatePiece,
  type EditCrop,
  type EditTimeline,
} from '../../../lib/video-edit';
import {
  toNativeTimeline,
  type NativeTimeline,
  type VideoEditorPreviewHandle,
} from '../../../modules/video-editor';
import { color, type } from '../../../theme/tokens';
import { Icon } from '../../ui/Icon';
import { PressableScale } from '../../ui/PressableScale';
import type { ShotPreview } from '../SegmentOverlayPreview';
import { clampCrop } from './CropGesture';
import { EditorStage, type StageSize } from './EditorStage';
import { EditorToolbar, type ToolId } from './EditorToolbar';
import { Timeline } from './Timeline';
import { SpeedOptions, ToolPanel } from './ToolPanel';
import { useEditHistory } from './useEditHistory';

export type EditorSlot = {
  slotIndex: number;
  label: string;
  sourceUri: string;
  durationMs: number;
  segment: BriefSegment | null;
  shot: ShotPreview | null;
};

export type PostEditorProps = {
  slots: EditorSlot[];
  initialTimeline: EditTimeline;
  overlay: TextOverlay;
  subtitles: { y: number } | null;
  onTimelineChange: (timeline: EditTimeline) => void;
  onMoveBox: (segment: BriefSegment, boxId: string, x: number, y: number) => void;
  onMoveCard: (segment: BriefSegment, x: number, y: number) => void;
  onMoveSubtitles: (y: number) => void;
  onBack: () => void;
  onReplaceSlot: (slotIndex: number) => void;
  onContinue: (timeline: EditTimeline) => void;
  /** Export or submit in flight; blocks every control and shows the label. */
  busyLabel: string | null;
  showPlaceHint: boolean;
  topInset: number;
  bottomInset: number;
};

type OpenTool = 'speed' | 'crop';

const NATIVE_MIN_GAP_MS = 80;
const IDENTITY_CROP: EditCrop = { scale: 1, x: 0, y: 0 };
const ARROW_RED = '#FE2C55';

function isIdentityCrop(crop: EditCrop): boolean {
  return crop.scale <= 1.001 && Math.abs(crop.x) < 0.001 && Math.abs(crop.y) < 0.001;
}

export function PostEditor(props: PostEditorProps): JSX.Element {
  const {
    slots,
    initialTimeline,
    overlay,
    subtitles,
    onTimelineChange,
    onMoveBox,
    onMoveCard,
    onMoveSubtitles,
    onBack,
    onReplaceSlot,
    onContinue,
    busyLabel,
    showPlaceHint,
    topInset,
    bottomInset,
  } = props;

  const history = useEditHistory(initialTimeline);
  const committed = history.timeline;
  const [preview, setPreview] = useState<EditTimeline | null>(null);
  const shown = preview ?? committed;

  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState(timelineDurationMs(shown));
  const [playing, setPlaying] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tool, setTool] = useState<OpenTool | null>(null);
  const [liveCrop, setLiveCrop] = useState<EditCrop | null>(null);
  const [cardSize, setCardSize] = useState<StageSize | null>(null);
  const [error, setError] = useState<string | null>(null);
  const previewRef = useRef<VideoEditorPreviewHandle>(null);
  const busy = busyLabel !== null;

  // Native rebuilds are throttled so trim drags do not thrash the player.
  const [nativeTimeline, setNativeTimeline] = useState<NativeTimeline>(() =>
    toNativeTimeline(shown),
  );
  const lastNativeAt = useRef(0);
  const lastNativeJson = useRef(JSON.stringify(nativeTimeline));
  useEffect(() => {
    const base =
      tool === 'crop' && selectedId !== null
        ? updatePiece(shown, selectedId, { crop: null })
        : shown;
    const next = toNativeTimeline(base);
    const json = JSON.stringify(next);
    if (json === lastNativeJson.current) return;
    const wait = Math.max(0, NATIVE_MIN_GAP_MS - (Date.now() - lastNativeAt.current));
    const timer = setTimeout(() => {
      lastNativeAt.current = Date.now();
      lastNativeJson.current = json;
      setNativeTimeline(next);
    }, wait);
    return () => clearTimeout(timer);
  }, [shown, tool, selectedId]);

  const reported = useRef(committed);
  useEffect(() => {
    if (reported.current === committed) return;
    reported.current = committed;
    onTimelineChange(committed);
  }, [committed, onTimelineChange]);

  const seek = useCallback((ms: number, precise: boolean) => {
    setPositionMs(ms);
    void previewRef.current?.seekTo(ms, precise).catch(() => undefined);
  }, []);

  const pause = useCallback(() => setPlaying(false), []);

  const current = pieceAt(shown, positionMs);
  const currentSlot = current
    ? slots.find((s) => s.slotIndex === current.piece.slotIndex) ?? null
    : null;
  const selected = selectedId !== null
    ? shown.pieces.find((p) => p.id === selectedId) ?? null
    : null;
  const allMuted = shown.pieces.length > 0 && shown.pieces.every((p) => p.muted);
  const canSplit = !busy && tool === null && canSplitAt(shown, positionMs);
  const canDelete =
    selected !== null && slotPieces(shown, selected.slotIndex).length > 1;

  function togglePlay() {
    if (busy || tool === 'crop') return;
    setPlaying((p) => !p);
  }

  function onScrubStart() {
    pause();
  }

  function onTrimPreview(pieceId: string, edges: { inMs?: number; outMs?: number }) {
    if (tool !== null || busy) return;
    const next = trimPiece(committed, pieceId, edges);
    setPreview(next);
    const range = pieceRanges(next).find((r) => r.piece.id === pieceId);
    if (!range) return;
    const at = edges.inMs !== undefined ? range.startMs : Math.max(range.startMs, range.endMs - 40);
    seek(at, false);
  }

  function onTrimCommit(pieceId: string, edges: { inMs?: number; outMs?: number }) {
    if (tool !== null || busy) return;
    const next = trimPiece(committed, pieceId, edges);
    setPreview(null);
    history.commit(next);
    const range = pieceRanges(next).find((r) => r.piece.id === pieceId);
    if (!range) return;
    const at = edges.inMs !== undefined ? range.startMs : Math.max(range.startMs, range.endMs - 40);
    seek(at, true);
  }

  function split() {
    pause();
    const hit = pieceAt(committed, positionMs);
    const next = splitAt(committed, positionMs);
    if (next === committed || !hit) return;
    history.commit(next);
    setSelectedId(hit.piece.id);
  }

  function remove() {
    if (!selected || !canDelete) return;
    pause();
    const range = pieceRanges(committed).find((r) => r.piece.id === selected.id);
    const next = deletePiece(committed, selected.id);
    history.commit(next);
    setSelectedId(null);
    const total = timelineDurationMs(next);
    seek(Math.min(range?.startMs ?? 0, Math.max(0, total - 1)), true);
  }

  function openSpeed() {
    if (!selected) return;
    pause();
    setTool('speed');
    const range = pieceRanges(committed).find((r) => r.piece.id === selected.id);
    if (range) seek(range.startMs, true);
  }

  function changeSpeed(value: number) {
    if (!selected) return;
    setPreview(updatePiece(committed, selected.id, { speed: clampSpeed(value) }));
  }

  function openCrop() {
    if (!selected) return;
    pause();
    const range = pieceRanges(committed).find((r) => r.piece.id === selected.id);
    if (range) seek(range.startMs, true);
    setLiveCrop(selected.crop ?? IDENTITY_CROP);
    setTool('crop');
  }

  function closeTool(save: boolean) {
    if (tool === 'speed') {
      if (save && preview !== null) history.commit(preview);
      setPreview(null);
    } else if (tool === 'crop' && selected !== null) {
      if (save && liveCrop !== null) {
        const crop = clampCrop(liveCrop);
        history.commit(
          updatePiece(committed, selected.id, { crop: isIdentityCrop(crop) ? null : crop }),
        );
      }
      setLiveCrop(null);
    }
    setTool(null);
  }

  function toggleSelectedMuted() {
    if (!selected) return;
    history.commit(updatePiece(committed, selected.id, { muted: !selected.muted }));
  }

  function onTool(id: ToolId) {
    if (busy) return;
    switch (id) {
      case 'split':
        split();
        return;
      case 'delete':
        remove();
        return;
      case 'speed':
        openSpeed();
        return;
      case 'crop':
        openCrop();
        return;
      case 'volume':
        toggleSelectedMuted();
        return;
      case 'replace':
        if (!selected) return;
        pause();
        Alert.alert(
          'Record this clip again?',
          'The camera opens for this part only. Cuts you made on it are cleared, everything else stays.',
          [
            { text: 'Keep it', style: 'cancel' },
            {
              text: 'Record again',
              style: 'destructive',
              onPress: () => onReplaceSlot(selected.slotIndex),
            },
          ],
        );
        return;
    }
  }

  function undo() {
    pause();
    setPreview(null);
    history.undo();
  }

  function redo() {
    pause();
    setPreview(null);
    history.redo();
  }

  function continueToSend() {
    if (busy) return;
    pause();
    if (tool !== null) closeTool(true);
    onContinue(preview ?? committed);
  }

  const speedCaption = useMemo(() => {
    if (!selected) return '';
    return `This clip plays for ${formatSeconds(pieceDurationMs(selected))}`;
  }, [selected]);

  return (
    <View style={styles.root}>
      <View style={[styles.header, { top: topInset + 8 }]} pointerEvents="box-none">
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Back to camera"
          onPress={onBack}
          disabled={busy}
          style={styles.roundBtn}
        >
          <Icon name="chevron-left" size={22} color={color.white} />
        </PressableScale>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Continue"
          onPress={continueToSend}
          disabled={busy}
          style={[styles.roundBtn, styles.nextBtn, busy && styles.btnOff]}
        >
          <Icon name="arrow-right" size={22} color={color.white} />
        </PressableScale>
      </View>

      <View style={[styles.stageWrap, { paddingTop: topInset + 8 }]}>
        <EditorStage
          ref={previewRef}
          timeline={nativeTimeline}
          playing={playing && !busy}
          onTime={(e) => setPositionMs(e.nativeEvent.positionMs)}
          onReady={(e) => setDurationMs(e.nativeEvent.durationMs)}
          onEnd={pause}
          onError={(e) => setError(e.nativeEvent.message)}
          onTogglePlay={togglePlay}
          onLayoutCard={setCardSize}
          cardSize={cardSize}
          segment={currentSlot?.segment ?? null}
          shot={currentSlot?.shot ?? null}
          overlay={overlay}
          subtitles={subtitles}
          onMoveBox={(boxId, x, y) => {
            if (currentSlot?.segment) onMoveBox(currentSlot.segment, boxId, x, y);
          }}
          onMoveCard={(x, y) => {
            if (currentSlot?.segment) onMoveCard(currentSlot.segment, x, y);
          }}
          onMoveSubtitles={onMoveSubtitles}
          onDragStart={pause}
          crop={tool === 'crop' ? liveCrop : null}
          onCropChange={setLiveCrop}
          onCropCommit={setLiveCrop}
        />
        {showPlaceHint && !playing && tool === null ? (
          <View style={styles.hint} pointerEvents="none">
            <Text style={styles.hintText}>Hold any text or picture to move it</Text>
          </View>
        ) : null}
        {tool === 'crop' ? (
          <View style={styles.hint} pointerEvents="none">
            <Text style={styles.hintText}>Pinch to zoom, drag to reframe</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.transport}>
        <Text style={styles.clock}>
          <Text style={styles.clockNow}>{formatClock(positionMs)}</Text>
          {`/${formatClock(durationMs)}`}
        </Text>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={playing ? 'Pause' : 'Play'}
          onPress={togglePlay}
          disabled={busy || tool === 'crop'}
          hitSlop={8}
          style={styles.playBtn}
        >
          <Icon name={playing ? 'pause' : 'play'} size={22} color={color.white} />
        </PressableScale>
        <View style={styles.historyBtns}>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="Undo"
            onPress={undo}
            disabled={!history.canUndo || busy || tool !== null}
            hitSlop={8}
            style={[styles.iconBtn, (!history.canUndo || tool !== null) && styles.btnOff]}
          >
            <Icon name="undo-2" size={20} color={color.white} />
          </PressableScale>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="Redo"
            onPress={redo}
            disabled={!history.canRedo || busy || tool !== null}
            hitSlop={8}
            style={[styles.iconBtn, (!history.canRedo || tool !== null) && styles.btnOff]}
          >
            <Icon name="redo-2" size={20} color={color.white} />
          </PressableScale>
        </View>
      </View>

      {currentSlot !== null ? (
        <Text style={styles.slotLabel} numberOfLines={1}>
          {currentSlot.label}
        </Text>
      ) : null}

      <Timeline
        timeline={shown}
        positionMs={positionMs}
        playing={playing}
        selectedPieceId={selectedId}
        onSelectPiece={(id) => {
          if (tool !== null) return;
          setSelectedId(id);
        }}
        onScrubStart={onScrubStart}
        onScrub={(ms) => seek(ms, false)}
        onScrubEnd={(ms) => seek(ms, true)}
        onTrimPreview={onTrimPreview}
        onTrimCommit={onTrimCommit}
        allMuted={allMuted}
        onToggleAllMuted={() => history.commit(setAllMuted(committed, !allMuted))}
      />

      <View style={[styles.tools, { paddingBottom: Math.max(bottomInset, 12) }]}>
        {tool === 'speed' && selected !== null ? (
          <ToolPanel title="Speed" onCancel={() => closeTool(false)} onDone={() => closeTool(true)}>
            <SpeedOptions
              options={EDIT_SPEEDS}
              value={selected.speed}
              onChange={changeSpeed}
              caption={speedCaption}
            />
          </ToolPanel>
        ) : tool === 'crop' ? (
          <ToolPanel title="Crop" onCancel={() => closeTool(false)} onDone={() => closeTool(true)}>
            <View style={styles.cropRow}>
              <PressableScale
                accessibilityRole="button"
                accessibilityLabel="Reset crop"
                onPress={() => setLiveCrop(IDENTITY_CROP)}
                style={styles.resetBtn}
              >
                <Icon name="rotate-ccw" size={16} color={color.white} />
                <Text style={styles.resetText}>Reset</Text>
              </PressableScale>
              <Text style={styles.cropZoom}>
                {`${(liveCrop?.scale ?? 1).toFixed(1)}x`}
              </Text>
            </View>
          </ToolPanel>
        ) : (
          <EditorToolbar
            canSplit={canSplit}
            hasSelection={selected !== null && !busy}
            canDelete={canDelete && !busy}
            selectedMuted={selected?.muted ?? false}
            onTool={onTool}
          />
        )}
      </View>

      {error !== null ? (
        <View style={styles.errorBar}>
          <Text style={styles.errorText} numberOfLines={2}>
            {error}
          </Text>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
            onPress={() => setError(null)}
            hitSlop={8}
          >
            <Icon name="x" size={16} color={color.white} />
          </PressableScale>
        </View>
      ) : null}

      {busy ? (
        <View style={styles.busy} pointerEvents="auto">
          <ActivityIndicator color={color.white} size="large" />
          <Text style={styles.busyText}>{busyLabel}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  roundBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextBtn: {
    backgroundColor: ARROW_RED,
  },
  btnOff: {
    opacity: 0.4,
  },
  stageWrap: {
    flex: 1,
    paddingBottom: 6,
  },
  hint: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 18,
    alignItems: 'center',
  },
  hintText: {
    color: color.white,
    fontSize: type.size.label,
    fontWeight: '600',
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    overflow: 'hidden',
  },
  transport: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  clock: {
    flex: 1,
    color: color.whiteA60,
    fontSize: type.size.meta,
    fontVariant: ['tabular-nums'],
  },
  clockNow: {
    color: color.white,
  },
  playBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyBtns: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 6,
  },
  iconBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotLabel: {
    color: color.whiteA60,
    fontSize: type.size.label,
    fontWeight: '600',
    paddingHorizontal: 16,
    paddingBottom: 2,
  },
  tools: {
    paddingTop: 8,
  },
  cropRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 44,
  },
  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#1C1C1E',
  },
  resetText: {
    color: color.white,
    fontSize: type.size.meta,
    fontWeight: '600',
  },
  cropZoom: {
    color: color.whiteA60,
    fontSize: type.size.meta,
    fontVariant: ['tabular-nums'],
  },
  errorBar: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 120,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(30,30,32,0.96)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  errorText: {
    flex: 1,
    color: color.white,
    fontSize: type.size.chip,
  },
  busy: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  busyText: {
    color: color.white,
    fontSize: type.size.bodySm,
    fontWeight: '600',
  },
});
