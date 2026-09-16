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
  setGain,
  slotPieces,
  splitAt,
  timelineDurationMs,
  trimPiece,
  updatePiece,
  type EditCrop,
  type EditTimeline,
  type SlotCue,
  type StoredCues,
  type StoredWords,
  type TranscriptWord,
} from '../../../lib/video-edit';
import { parseOverlayBoxes } from '../../../lib/overlay-boxes';
import {
  toNativeTimeline,
  type NativeTimeline,
  type VideoEditorPreviewHandle,
} from '../../../modules/video-editor';
import { color, type } from '../../../theme/tokens';
import { Icon } from '../../ui/Icon';
import { PressableScale } from '../../ui/PressableScale';
import type { ShotPreview } from '../SegmentOverlayPreview';
import { TextColorPicker } from '../TextColorPicker';
import { clampCrop } from './CropGesture';
import {
  DEFAULT_TEXT_HOLD_MS,
  MIN_TEXT_HOLD_MS,
  slotSourceToTimelineMs,
  slotTimelineRange,
  type CueDrag,
  type CueSelection,
  type CueSlot,
} from './CueMarkers';
import { CuePanel } from './CuePanel';
import { EditorStage, type StageSize } from './EditorStage';
import { EditorToolbar, type ToolId } from './EditorToolbar';
import { Timeline } from './Timeline';
import { GainFader, SpeedOptions, ToolPanel } from './ToolPanel';
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
  onStyleBox: (segment: BriefSegment, boxId: string, color: string, bg: boolean) => void;
  onMoveCard: (segment: BriefSegment, x: number, y: number) => void;
  onMoveSubtitles: (y: number) => void;
  /** Cue timing per slot index (source ms) and the cached transcripts. */
  cues: StoredCues;
  words: StoredWords;
  /** Slots whose cue suggestion is still being fetched. */
  cuePendingSlots: number[];
  onCueChange: (slotIndex: number, cue: SlotCue | null) => void;
  onResetCue: (slotIndex: number) => void;
  onBack: () => void;
  onReplaceSlot: (slotIndex: number) => void;
  onContinue: (timeline: EditTimeline) => void;
  /** Export or submit in flight; blocks every control and shows the label. */
  busyLabel: string | null;
  showPlaceHint: boolean;
  /** The initial timeline was just auto trimmed to speech; show the pill briefly. */
  trimmedToSpeech: boolean;
  topInset: number;
  bottomInset: number;
};

type OpenTool = 'speed' | 'crop' | 'volume' | 'text-color' | 'cue';

const SPEECH_PILL_MS = 2000;

const EMPTY_CUE: SlotCue = {
  text_start_ms: null,
  text_hold_ms: null,
  media_start_ms: null,
  media_end_ms: null,
  source: 'creator',
};

function cueAfterDrag(base: SlotCue, drag: CueDrag): SlotCue {
  switch (drag.kind) {
    case 'text':
      return { ...base, text_start_ms: drag.sourceMs, source: 'creator' };
    case 'media':
      return { ...base, media_start_ms: drag.sourceMs, source: 'creator' };
    case 'hold': {
      const start = base.text_start_ms ?? 0;
      return {
        ...base,
        text_hold_ms: Math.max(MIN_TEXT_HOLD_MS, drag.sourceMs - start),
        source: 'creator',
      };
    }
  }
}

function cueStartMs(cue: SlotCue | null, kind: CueSelection['kind']): number {
  if (kind === 'text') return cue?.text_start_ms ?? 0;
  return cue?.media_start_ms ?? 0;
}

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
    onStyleBox,
    onMoveCard,
    onMoveSubtitles,
    cues,
    words,
    cuePendingSlots,
    onCueChange,
    onResetCue,
    onBack,
    onReplaceSlot,
    onContinue,
    busyLabel,
    showPlaceHint,
    trimmedToSpeech,
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
  const [selectedCue, setSelectedCue] = useState<CueSelection | null>(null);
  const [cuePreview, setCuePreview] = useState<{ slotIndex: number; cue: SlotCue } | null>(null);
  const cueAtOpen = useRef<SlotCue | null>(null);
  const previewRef = useRef<VideoEditorPreviewHandle>(null);
  const busy = busyLabel !== null;

  const shownCues = useMemo<StoredCues>(
    () => (cuePreview ? { ...cues, [String(cuePreview.slotIndex)]: cuePreview.cue } : cues),
    [cues, cuePreview],
  );

  const [speechPill, setSpeechPill] = useState(trimmedToSpeech);
  useEffect(() => {
    if (!trimmedToSpeech) return;
    const timer = setTimeout(() => setSpeechPill(false), SPEECH_PILL_MS);
    return () => clearTimeout(timer);
  }, [trimmedToSpeech]);

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
  const currentSegment = currentSlot?.segment ?? null;
  const currentBoxes = useMemo(
    () =>
      currentSegment && currentSegment.show_on_screen && overlay.enabled
        ? parseOverlayBoxes(currentSegment.overlay_style, {
            text: currentSegment.overlay_text,
            textY: currentSegment.text_y,
          })
        : [],
    [currentSegment, overlay.enabled],
  );
  const canSplit = !busy && tool === null && canSplitAt(shown, positionMs);
  const canDelete =
    selected !== null && slotPieces(shown, selected.slotIndex).length > 1;

  const cueSlots = useMemo<CueSlot[]>(
    () =>
      slots
        .map((s) => ({
          slotIndex: s.slotIndex,
          label: s.label,
          hasText: s.segment !== null && s.segment.show_on_screen && overlay.enabled,
          hasMedia: s.segment !== null && s.segment.screenshot_url !== null,
          cue: shownCues[String(s.slotIndex)] ?? null,
          pending: cuePendingSlots.includes(s.slotIndex),
        }))
        .filter((s) => s.hasText || s.hasMedia),
    [slots, overlay.enabled, shownCues, cuePendingSlots],
  );

  // The stage shows the segment's text and screenshot only inside their cue windows.
  const cueGate = useMemo(() => {
    if (!currentSlot) return { showText: true, showMedia: true };
    const slot = currentSlot.slotIndex;
    const cue = shownCues[String(slot)] ?? null;
    const range = slotTimelineRange(shown, slot);
    if (!range) return { showText: true, showMedia: true };
    const textStart = cue?.text_start_ms ?? 0;
    const textFrom = slotSourceToTimelineMs(shown, slot, textStart);
    const textTo = slotSourceToTimelineMs(
      shown,
      slot,
      textStart + (cue?.text_hold_ms ?? DEFAULT_TEXT_HOLD_MS),
    );
    const mediaFrom = slotSourceToTimelineMs(shown, slot, cue?.media_start_ms ?? 0);
    const mediaTo =
      cue?.media_end_ms !== null && cue?.media_end_ms !== undefined
        ? slotSourceToTimelineMs(shown, slot, cue.media_end_ms)
        : range.endMs;
    const t = positionMs;
    return {
      showText: t >= textFrom && (t < textTo || textTo >= range.endMs),
      showMedia: t >= mediaFrom && (t < mediaTo || mediaTo >= range.endMs),
    };
  }, [currentSlot, shownCues, shown, positionMs]);

  const selectedCueValue =
    selectedCue !== null ? shownCues[String(selectedCue.slotIndex)] ?? null : null;
  const selectedCueWords: TranscriptWord[] =
    selectedCue !== null ? words[String(selectedCue.slotIndex)] ?? [] : [];

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

  function openVolume() {
    pause();
    setTool('volume');
  }

  function changeGain(value: number) {
    setPreview(setGain(committed, value));
  }

  function cueToolBlocked(): boolean {
    return busy || (tool !== null && tool !== 'cue');
  }

  function selectCue(selection: CueSelection) {
    if (cueToolBlocked()) return;
    pause();
    setSelectedId(null);
    if (tool !== 'cue' || selectedCue?.slotIndex !== selection.slotIndex) {
      cueAtOpen.current = cues[String(selection.slotIndex)] ?? null;
    }
    setSelectedCue(selection);
    setTool('cue');
    const start = cueStartMs(cues[String(selection.slotIndex)] ?? null, selection.kind);
    seek(slotSourceToTimelineMs(committed, selection.slotIndex, start), true);
  }

  function cueSeekMs(drag: CueDrag): number {
    const at = slotSourceToTimelineMs(shown, drag.slotIndex, drag.sourceMs);
    return drag.kind === 'hold' ? Math.max(0, at - 40) : at;
  }

  function previewCueDrag(drag: CueDrag) {
    if (cueToolBlocked()) return;
    const cue = cueAfterDrag(cues[String(drag.slotIndex)] ?? EMPTY_CUE, drag);
    setCuePreview({ slotIndex: drag.slotIndex, cue });
    seek(cueSeekMs(drag), false);
  }

  function commitCueDrag(drag: CueDrag) {
    if (cueToolBlocked()) return;
    const cue = cueAfterDrag(cues[String(drag.slotIndex)] ?? EMPTY_CUE, drag);
    setCuePreview(null);
    onCueChange(drag.slotIndex, cue);
    seek(cueSeekMs(drag), true);
  }

  function pickCueWord(word: TranscriptWord) {
    if (!selectedCue) return;
    commitCueDrag({ slotIndex: selectedCue.slotIndex, kind: selectedCue.kind, sourceMs: word.s });
  }

  function closeTool(save: boolean) {
    if (tool === 'cue') {
      if (!save && selectedCue !== null) {
        const now = cues[String(selectedCue.slotIndex)] ?? null;
        if (JSON.stringify(now) !== JSON.stringify(cueAtOpen.current)) {
          onCueChange(selectedCue.slotIndex, cueAtOpen.current);
        }
      }
      setCuePreview(null);
      setSelectedCue(null);
    } else if (tool === 'speed' || tool === 'volume') {
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
      case 'mute':
        toggleSelectedMuted();
        return;
      case 'volume':
        openVolume();
        return;
      case 'text-color':
        if (currentBoxes.length === 0) return;
        pause();
        setTool('text-color');
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

  const cueCaption = useMemo(() => {
    if (!selectedCue) return '';
    const range = slotTimelineRange(shown, selectedCue.slotIndex);
    if (!range) return '';
    const start = cueStartMs(selectedCueValue, selectedCue.kind);
    const at = slotSourceToTimelineMs(shown, selectedCue.slotIndex, start) - range.startMs;
    if (selectedCue.kind === 'media') return `Screenshot shows at ${formatSeconds(at)}`;
    const holdEnd =
      slotSourceToTimelineMs(
        shown,
        selectedCue.slotIndex,
        start + (selectedCueValue?.text_hold_ms ?? DEFAULT_TEXT_HOLD_MS),
      ) - range.startMs;
    return `Text shows at ${formatSeconds(at)} for ${formatSeconds(holdEnd - at)}`;
  }, [selectedCue, selectedCueValue, shown]);

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
          showText={cueGate.showText}
          showMedia={cueGate.showMedia}
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
        {speechPill ? (
          <View style={[styles.speechPill, { top: topInset + 60 }]} pointerEvents="none">
            <Text style={styles.hintText}>Trimmed to speech</Text>
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
        cueSlots={cueSlots}
        selectedCue={tool === 'cue' ? selectedCue : null}
        onSelectCue={selectCue}
        onCuePreview={previewCueDrag}
        onCueCommit={commitCueDrag}
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
        ) : tool === 'volume' ? (
          <ToolPanel title="Volume" onCancel={() => closeTool(false)} onDone={() => closeTool(true)}>
            <GainFader value={shown.gain} onChange={changeGain} />
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
        ) : tool === 'text-color' && currentSegment !== null && currentBoxes.length > 0 ? (
          <ToolPanel
            title="Text color"
            onCancel={() => closeTool(false)}
            onDone={() => closeTool(true)}
          >
            <TextColorPicker
              key={currentSegment.id}
              boxes={currentBoxes}
              onChange={(boxId, pick) =>
                onStyleBox(currentSegment, boxId, pick.color, pick.bg)
              }
            />
          </ToolPanel>
        ) : tool === 'cue' && selectedCue !== null ? (
          <ToolPanel
            title="When it shows"
            onCancel={() => closeTool(false)}
            onDone={() => closeTool(true)}
          >
            <CuePanel
              words={selectedCueWords}
              sourceMs={cueStartMs(selectedCueValue, selectedCue.kind)}
              kindLabel={cueCaption}
              pending={cuePendingSlots.includes(selectedCue.slotIndex)}
              canReset={selectedCueValue === null || selectedCueValue.source === 'creator'}
              onPickWord={pickCueWord}
              onReset={() => onResetCue(selectedCue.slotIndex)}
            />
          </ToolPanel>
        ) : (
          <EditorToolbar
            canSplit={canSplit}
            hasSelection={selected !== null && !busy}
            canDelete={canDelete && !busy}
            selectedMuted={selected?.muted ?? false}
            canStyleText={currentBoxes.length > 0 && !busy}
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
  speechPill: {
    position: 'absolute',
    left: 0,
    right: 0,
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
