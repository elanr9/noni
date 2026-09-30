// Creator video editor: the last stop before a video post goes to review.
// Owns one undoable document (cut timeline, text boxes, inset placement),
// the preview playhead and the open tool; the record screen owns the clips,
// timeline persistence, re-records and the final export.
import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { BriefSegment, TextOverlay } from '../../../lib/briefs-api';
import {
  CLASSIC_TEXT_COLOR,
  DEFAULT_BOX_SIZE,
  type OverlayBox,
} from '../../../lib/overlay-boxes';
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
import {
  toNativeTimeline,
  type NativeTimeline,
  type PreviewErrorEvent,
  type PreviewReadyEvent,
  type PreviewTimeEvent,
  type VideoEditorPreviewHandle,
} from '../../../modules/video-editor';
import { color, type } from '../../../theme/tokens';
import { Icon } from '../../ui/Icon';
import { PressableScale } from '../../ui/PressableScale';
import type { ShotPreview } from '../SegmentOverlayPreview';
import { TextColorPicker, type TextColorPick } from '../TextColorPicker';
import { clampCrop } from './CropGesture';
import {
  MIN_TEXT_HOLD_MS,
  slotSourceToTimelineMs,
  slotTextWindow,
  slotTimelineRange,
  type CueDrag,
  type CueSelection,
  type CueSlot,
} from './CueMarkers';
import { CuePanel } from './CuePanel';
import {
  docBoxes,
  docInset,
  initialDoc,
  withBoxes,
  withBoxesRestyled,
  withInset,
  withTimeline,
  type EditorDoc,
} from './editorDoc';
import { EditorStage, type StageSize } from './EditorStage';
import { EditorToolbar, type ToolId } from './EditorToolbar';
import { Playhead } from './playhead';
import type { InsetPlacement } from './StageInset';
import type { BoxPlacement } from './StageTextBox';
import { SUBTITLE_PLACEHOLDER, subtitleBand, subtitleChunks, subtitleTextAt } from './subtitles';
import { TextEditSheet } from './TextEditSheet';
import { Timeline, type TrimEdges } from './Timeline';
import { GainFader, SpeedOptions, ToolPanel } from './ToolPanel';
import { useEditHistory } from './useEditHistory';
import { useEvent } from './useEvent';
import { useSegmentPersistence, type SegmentWriter } from './useSegmentPersistence';

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
  /** Legacy: text box moves now flow through onBoxesChange; kept so older callers type check. */
  onMoveBox: (segment: BriefSegment, boxId: string, x: number, y: number) => void;
  onStyleBox: (segment: BriefSegment, boxId: string, color: string, bg: boolean) => void;
  /** Legacy: inset moves now flow through onPlaceInset; kept so older callers type check. */
  onMoveCard: (segment: BriefSegment, x: number, y: number) => void;
  onMoveSubtitles: (y: number) => void;
  /**
   * Mirror of every creator text box edit on a clip (add, words, resize,
   * move, delete, undo). The editor saves them itself with creatorEditSegmentBoxes.
   */
  onBoxesChange?: (segment: BriefSegment, boxes: OverlayBox[]) => void;
  /**
   * Mirror of the creator's inset placement (centre and width as frame
   * fractions). The editor saves it itself with creatorPlaceSegment.
   */
  onPlaceInset?: (segment: BriefSegment, placement: InsetPlacement) => void;
  /** Cue timing per slot index (source ms) and the cached transcripts. */
  cues: StoredCues;
  words: StoredWords;
  /** Slots whose cue suggestion is still being fetched. */
  cuePendingSlots: number[];
  onCueChange: (slotIndex: number, cue: SlotCue | null) => void;
  /** Screenshot timing back to the AI suggestion (text resets locally to the whole clip). */
  onResetCue: (slotIndex: number) => void;
  onBack: () => void;
  onReplaceSlot: (slotIndex: number) => void;
  onContinue: (timeline: EditTimeline) => void;
  /**
   * 'creator' (default) cuts the footage and re-records; 'manager' reviews
   * uploaded clips, so only text, pictures, subtitles and cue timing are
   * offered and the header reads Cancel / Done.
   */
  mode?: 'creator' | 'manager';
  /** Where segment boxes and insets save; defaults to the creator RPCs. */
  segmentWriter?: SegmentWriter;
  /** Export or submit in flight; blocks every control and shows the label. */
  busyLabel: string | null;
  showPlaceHint: boolean;
  /** The initial timeline was just auto trimmed to speech; show the pill briefly. */
  trimmedToSpeech: boolean;
  topInset: number;
  bottomInset: number;
};

type OpenTool = 'speed' | 'crop' | 'volume' | 'text-color' | 'cue';

type TextEdit = { segment: BriefSegment; boxId: string | null };

const SPEECH_PILL_MS = 2000;
/** How often the playhead is mirrored into React state for labels. */
const POSITION_MIRROR_MS = 66;
/** Imprecise player seeks while scrubbing are spaced at least this far apart. */
const SEEK_MIN_GAP_MS = 80;
/** The player reports a little past the end of a piece before the next frame lands. */
const LOOP_SLACK_MS = 20;
const NEW_BOX_X = 0.5;
const NEW_BOX_Y = 0.3;
const DRAFT_BOX_ID = 'draft';
/** Fixed height of the tool area so swapping toolbar and panels never moves the stage. */
const TOOLS_H = 140;
const HEADER_H = 42;

const EMPTY_CUE: SlotCue = {
  text_start_ms: null,
  text_hold_ms: null,
  media_start_ms: null,
  media_end_ms: null,
  source: 'creator',
};

function newBoxId(): string {
  return `box-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

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
        text_start_ms: start,
        text_hold_ms: Math.max(MIN_TEXT_HOLD_MS, drag.sourceMs - start),
        source: 'creator',
      };
    }
  }
}

/** Source ms where the selected cue kind enters its slot. */
function cueStartMs(
  timeline: EditTimeline,
  slotIndex: number,
  cue: SlotCue | null,
  kind: CueSelection['kind'],
): number {
  if (kind === 'text') return slotTextWindow(cue, slotPieces(timeline, slotIndex)).startMs;
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
    onStyleBox,
    onMoveSubtitles,
    onBoxesChange,
    onPlaceInset,
    cues,
    words,
    cuePendingSlots,
    onCueChange,
    onResetCue,
    onBack,
    onReplaceSlot,
    onContinue,
    mode = 'creator',
    segmentWriter,
    busyLabel,
    showPlaceHint,
    trimmedToSpeech,
    topInset,
    bottomInset,
  } = props;

  // The parent's insets win when larger; the device's keep the stage off the island.
  const safe = useSafeAreaInsets();
  const top = Math.max(topInset, safe.top);
  const bottom = Math.max(bottomInset, safe.bottom, 12);

  const history = useEditHistory<EditorDoc>(initialDoc(initialTimeline));
  const doc = history.present;
  const committed = doc.timeline;
  const [preview, setPreview] = useState<EditTimeline | null>(null);
  const shown = preview ?? committed;

  // The playhead ticks at frame rate outside React; positionMs is a low rate
  // mirror for the clock, the slot label and the cue gates.
  const [playhead] = useState(() => new Playhead());
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState(timelineDurationMs(shown));
  const [playing, setPlaying] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(null);
  const [insetSelected, setInsetSelected] = useState(false);
  const [textEdit, setTextEdit] = useState<TextEdit | null>(null);
  const [liveDraft, setLiveDraft] = useState<string | null>(null);
  const [tool, setTool] = useState<OpenTool | null>(null);
  const [liveCrop, setLiveCrop] = useState<EditCrop | null>(null);
  const [cardSize, setCardSize] = useState<StageSize | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedCue, setSelectedCue] = useState<CueSelection | null>(null);
  const [cuePreview, setCuePreview] = useState<{ slotIndex: number; cue: SlotCue } | null>(null);
  const cueAtOpen = useRef<SlotCue | null>(null);
  const previewRef = useRef<VideoEditorPreviewHandle>(null);
  const busy = busyLabel !== null;

  const segmentsById = useMemo(() => {
    const map = new Map<string, BriefSegment>();
    for (const slot of slots) if (slot.segment) map.set(slot.segment.id, slot.segment);
    return map;
  }, [slots]);

  const persistence = useSegmentPersistence({
    doc,
    segments: segmentsById,
    onError: setError,
    onBoxesChange,
    onPlaceInset,
    writer: segmentWriter,
  });
  const managerMode = mode === 'manager';

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

  const commitTimeline = useCallback(
    (next: EditTimeline) => history.commit((d) => withTimeline(d, next)),
    [history],
  );

  const lastMirrorAt = useRef(0);
  const setPosition = useCallback(
    (ms: number, force: boolean) => {
      playhead.set(ms);
      const now = Date.now();
      if (!force && now - lastMirrorAt.current < POSITION_MIRROR_MS) return;
      lastMirrorAt.current = now;
      setPositionMs(ms);
    },
    [playhead],
  );

  const seekTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSeekAt = useRef(0);
  const seek = useCallback(
    (ms: number, precise: boolean) => {
      setPosition(ms, precise);
      if (seekTimer.current !== null) {
        clearTimeout(seekTimer.current);
        seekTimer.current = null;
      }
      const run = () => {
        lastSeekAt.current = Date.now();
        void previewRef.current?.seekTo(ms, precise).catch(() => undefined);
      };
      if (precise) {
        run();
        return;
      }
      const wait = SEEK_MIN_GAP_MS - (Date.now() - lastSeekAt.current);
      if (wait <= 0) {
        run();
        return;
      }
      seekTimer.current = setTimeout(() => {
        seekTimer.current = null;
        run();
      }, wait);
    },
    [setPosition],
  );
  useEffect(() => {
    return () => {
      if (seekTimer.current !== null) clearTimeout(seekTimer.current);
    };
  }, []);

  const pause = useCallback(() => {
    setPlaying(false);
    setPositionMs(playhead.get());
  }, [playhead]);

  const current = pieceAt(shown, positionMs);
  const currentSlot = current
    ? slots.find((s) => s.slotIndex === current.piece.slotIndex) ?? null
    : null;
  const selected = selectedId !== null
    ? shown.pieces.find((p) => p.id === selectedId) ?? null
    : null;
  const selectedRange = useMemo(
    () => (selected ? pieceRanges(shown).find((r) => r.piece.id === selected.id) ?? null : null),
    [shown, selected],
  );

  // Playback loops inside the selected piece. Read through refs so the
  // frame rate onTime handler never closes over stale state.
  const loopRef = useRef(selectedRange);
  const playingRef = useRef(playing);
  useEffect(() => {
    loopRef.current = selectedRange;
    playingRef.current = playing;
  }, [selectedRange, playing]);

  const onTime = useCallback(
    (e: PreviewTimeEvent) => {
      const ms = e.nativeEvent.positionMs;
      const loop = loopRef.current;
      if (playingRef.current && loop !== null && ms >= loop.endMs - LOOP_SLACK_MS) {
        seek(loop.startMs, true);
        return;
      }
      setPosition(ms, false);
    },
    [seek, setPosition],
  );
  const onReady = useCallback((e: PreviewReadyEvent) => setDurationMs(e.nativeEvent.durationMs), []);
  const onPreviewError = useCallback((e: PreviewErrorEvent) => setError(e.nativeEvent.message), []);

  const allMuted = shown.pieces.length > 0 && shown.pieces.every((p) => p.muted);
  const currentSegment = currentSlot?.segment ?? null;
  const storedBoxes = useMemo(
    () => docBoxes(doc, currentSegment, overlay.enabled),
    [doc, currentSegment, overlay.enabled],
  );
  // While the sheet is open the stage shows the words as they are typed.
  const currentBoxes = useMemo(() => {
    if (textEdit === null || liveDraft === null || textEdit.segment.id !== currentSegment?.id) {
      return storedBoxes;
    }
    if (textEdit.boxId !== null) {
      return storedBoxes.map((b) => (b.id === textEdit.boxId ? { ...b, text: liveDraft } : b));
    }
    if (liveDraft.trim().length === 0) return storedBoxes;
    const draft: OverlayBox = {
      id: DRAFT_BOX_ID,
      text: liveDraft,
      color: CLASSIC_TEXT_COLOR,
      bg: false,
      size: DEFAULT_BOX_SIZE,
      x: NEW_BOX_X,
      y: NEW_BOX_Y,
    };
    return [...storedBoxes, draft];
  }, [storedBoxes, textEdit, liveDraft, currentSegment]);
  const selectedBox =
    selectedBoxId !== null ? storedBoxes.find((b) => b.id === selectedBoxId) ?? null : null;
  const canAddText = currentSegment !== null && overlay.enabled && !busy;
  const currentInset = useMemo(
    () => (currentSegment !== null ? docInset(doc, currentSegment) : null),
    [doc, currentSegment],
  );
  const currentShot = currentSlot?.shot ?? null;
  const insetShown =
    currentShot !== null && currentSegment !== null && currentSegment.layout !== 'green_screen';

  // The subtitle line the render will burn in at the playhead, from the slot transcript.
  const currentChunks = useMemo(
    () => (currentSlot ? subtitleChunks(words[String(currentSlot.slotIndex)] ?? []) : []),
    [words, currentSlot],
  );
  // With a transcript, gaps between spoken lines show nothing (as the render
  // does); the placeholder only stands in while no transcript exists yet.
  const subtitleText = useMemo(() => {
    if (subtitles === null || current === null) return null;
    if (currentChunks.length === 0) return SUBTITLE_PLACEHOLDER;
    const sourceMs = current.piece.inMs + (positionMs - current.startMs) * current.piece.speed;
    return subtitleTextAt(currentChunks, sourceMs) ?? '';
  }, [subtitles, current, positionMs, currentChunks]);
  const stageSubtitles = useMemo(
    () => (subtitles !== null ? { y: subtitles.y, text: subtitleText } : null),
    [subtitles, subtitleText],
  );
  const avoidBand = useMemo(
    () => (subtitles !== null ? subtitleBand(subtitles.y) : null),
    [subtitles],
  );

  const canSplit = !busy && tool === null && canSplitAt(shown, positionMs);
  const canDeletePiece =
    selected !== null && slotPieces(shown, selected.slotIndex).length > 1;
  const canDelete = selectedBox !== null || canDeletePiece;

  const cueSlots = useMemo<CueSlot[]>(
    () =>
      slots
        .map((s) => ({
          slotIndex: s.slotIndex,
          label: s.label,
          hasText: docBoxes(doc, s.segment, overlay.enabled).length > 0,
          hasMedia: s.segment !== null && s.segment.screenshot_url !== null,
          cue: shownCues[String(s.slotIndex)] ?? null,
          pending: cuePendingSlots.includes(s.slotIndex),
        }))
        .filter((s) => s.hasText || s.hasMedia),
    [slots, overlay.enabled, shownCues, cuePendingSlots, doc],
  );

  // The stage shows the segment's text and screenshot only inside their cue
  // windows. Text covers the whole clip unless the creator narrowed it.
  const cueGate = useMemo(() => {
    if (!currentSlot) return { showText: true, showMedia: true };
    const slot = currentSlot.slotIndex;
    const cue = shownCues[String(slot)] ?? null;
    const range = slotTimelineRange(shown, slot);
    if (!range) return { showText: true, showMedia: true };
    const textWindow = slotTextWindow(cue, slotPieces(shown, slot));
    const textFrom = slotSourceToTimelineMs(shown, slot, textWindow.startMs);
    const textTo = slotSourceToTimelineMs(shown, slot, textWindow.endMs);
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

  function clearStageSelection() {
    setSelectedBoxId(null);
    setInsetSelected(false);
  }

  function togglePlay() {
    if (busy || tool === 'crop') return;
    if (playing) {
      pause();
      return;
    }
    // Start inside the selected piece so the loop has somewhere to go.
    const loop = selectedRange;
    const at = playhead.get();
    if (loop !== null && (at < loop.startMs || at >= loop.endMs - LOOP_SLACK_MS)) {
      seek(loop.startMs, true);
    }
    setPlaying(true);
  }

  const onStagePress = useEvent(() => {
    if (selectedBoxId !== null || insetSelected) {
      clearStageSelection();
      return;
    }
    togglePlay();
  });

  const onScrubStart = useEvent(() => pause());
  const onScrub = useEvent((ms: number) => seek(ms, false));
  const onScrubEnd = useEvent((ms: number) => seek(ms, true));

  const onSelectPiece = useEvent((id: string | null) => {
    if (tool !== null) return;
    clearStageSelection();
    // Managers never cut footage, so a clip never selects (no trim handles).
    setSelectedId(managerMode ? null : id);
  });

  const onTrimPreview = useEvent((pieceId: string, edges: TrimEdges) => {
    if (tool !== null || busy) return;
    const next = trimPiece(committed, pieceId, edges);
    setPreview(next);
    const range = pieceRanges(next).find((r) => r.piece.id === pieceId);
    if (!range) return;
    const at = edges.inMs !== undefined ? range.startMs : Math.max(range.startMs, range.endMs - 40);
    seek(at, false);
  });

  const onTrimCommit = useEvent((pieceId: string, edges: TrimEdges) => {
    if (tool !== null || busy) return;
    const next = trimPiece(committed, pieceId, edges);
    setPreview(null);
    commitTimeline(next);
    const range = pieceRanges(next).find((r) => r.piece.id === pieceId);
    if (!range) return;
    const at = edges.inMs !== undefined ? range.startMs : Math.max(range.startMs, range.endMs - 40);
    seek(at, true);
  });

  const onToggleAllMuted = useEvent(() => commitTimeline(setAllMuted(committed, !allMuted)));

  // Text boxes. Gestures commit once on release; the sheet saves the words.
  const selectBox = useEvent((boxId: string) => {
    if (busy || tool !== null || boxId === DRAFT_BOX_ID) return;
    pause();
    setSelectedId(null);
    setInsetSelected(false);
    setSelectedBoxId(boxId);
  });

  const editBox = useEvent((boxId: string) => {
    if (busy || tool !== null || currentSegment === null || boxId === DRAFT_BOX_ID) return;
    pause();
    setSelectedId(null);
    setSelectedBoxId(boxId);
    setLiveDraft(null);
    setTextEdit({ segment: currentSegment, boxId });
  });

  const commitBox = useEvent((boxId: string, placement: BoxPlacement) => {
    if (currentSegment === null || boxId === DRAFT_BOX_ID) return;
    history.commit((d) =>
      withBoxes(
        d,
        currentSegment.id,
        docBoxes(d, currentSegment, true).map((b) =>
          b.id === boxId
            ? {
                ...b,
                x: placement.x,
                y: placement.y,
                size: placement.size,
                ...(placement.width !== undefined ? { width: placement.width } : {}),
              }
            : b,
        ),
      ),
    );
  });

  function addText() {
    if (!canAddText || currentSegment === null) return;
    pause();
    setSelectedId(null);
    setLiveDraft(null);
    setTextEdit({ segment: currentSegment, boxId: null });
  }

  function closeTextSheet() {
    setTextEdit(null);
    setLiveDraft(null);
  }

  function saveText(text: string) {
    if (textEdit === null) return;
    const { segment, boxId } = textEdit;
    if (boxId === null) {
      const box: OverlayBox = {
        id: newBoxId(),
        text,
        color: CLASSIC_TEXT_COLOR,
        bg: false,
        size: DEFAULT_BOX_SIZE,
        x: NEW_BOX_X,
        y: NEW_BOX_Y,
      };
      history.commit((d) => withBoxes(d, segment.id, [...docBoxes(d, segment, true), box]));
      setSelectedBoxId(box.id);
    } else {
      history.commit((d) =>
        withBoxes(
          d,
          segment.id,
          docBoxes(d, segment, true).map((b) => (b.id === boxId ? { ...b, text } : b)),
        ),
      );
    }
    closeTextSheet();
  }

  function deleteSelectedBox() {
    if (currentSegment === null || selectedBox === null) return;
    const id = selectedBox.id;
    history.commit((d) =>
      withBoxes(
        d,
        currentSegment.id,
        docBoxes(d, currentSegment, true).filter((b) => b.id !== id),
      ),
    );
    setSelectedBoxId(null);
  }

  // One look for the whole post: the parent persists it brief wide, the
  // local overrides follow without an undo step.
  function pickTextColor(boxId: string, pick: TextColorPick) {
    if (currentSegment === null) return;
    onStyleBox(currentSegment, boxId, pick.color, pick.bg);
    history.amend((d) =>
      withBoxesRestyled(d, pick.color, pick.bg, {
        segmentId: currentSegment.id,
        boxes: docBoxes(d, currentSegment, true),
      }),
    );
  }

  // Inset media: one gesture commit on release.
  const selectInset = useEvent(() => {
    if (busy || tool !== null) return;
    pause();
    setSelectedId(null);
    setSelectedBoxId(null);
    setInsetSelected(true);
  });

  const commitInset = useEvent((placement: InsetPlacement) => {
    if (currentSegment === null) return;
    history.commit((d) => withInset(d, currentSegment.id, placement));
  });

  function split() {
    pause();
    const at = playhead.get();
    const hit = pieceAt(committed, at);
    const next = splitAt(committed, at);
    if (next === committed || !hit) return;
    commitTimeline(next);
    setSelectedId(hit.piece.id);
  }

  function remove() {
    if (!selected || !canDeletePiece) return;
    pause();
    const range = pieceRanges(committed).find((r) => r.piece.id === selected.id);
    const next = deletePiece(committed, selected.id);
    commitTimeline(next);
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

  const selectCue = useEvent((selection: CueSelection) => {
    if (cueToolBlocked()) return;
    pause();
    setSelectedId(null);
    clearStageSelection();
    if (tool !== 'cue' || selectedCue?.slotIndex !== selection.slotIndex) {
      cueAtOpen.current = cues[String(selection.slotIndex)] ?? null;
    }
    setSelectedCue(selection);
    setTool('cue');
    const start = cueStartMs(
      committed,
      selection.slotIndex,
      cues[String(selection.slotIndex)] ?? null,
      selection.kind,
    );
    seek(slotSourceToTimelineMs(committed, selection.slotIndex, start), true);
  });

  function cueSeekMs(drag: CueDrag): number {
    const at = slotSourceToTimelineMs(shown, drag.slotIndex, drag.sourceMs);
    return drag.kind === 'hold' ? Math.max(0, at - 40) : at;
  }

  const previewCueDrag = useEvent((drag: CueDrag) => {
    if (cueToolBlocked()) return;
    const cue = cueAfterDrag(cues[String(drag.slotIndex)] ?? EMPTY_CUE, drag);
    setCuePreview({ slotIndex: drag.slotIndex, cue });
    seek(cueSeekMs(drag), false);
  });

  const commitCueDrag = useEvent((drag: CueDrag) => {
    if (cueToolBlocked()) return;
    const cue = cueAfterDrag(cues[String(drag.slotIndex)] ?? EMPTY_CUE, drag);
    setCuePreview(null);
    onCueChange(drag.slotIndex, cue);
    seek(cueSeekMs(drag), true);
  });

  const pickCueWord = useEvent((word: TranscriptWord) => {
    if (!selectedCue) return;
    commitCueDrag({ slotIndex: selectedCue.slotIndex, kind: selectedCue.kind, sourceMs: word.s });
  });

  /** Text goes back to covering the whole clip; the screenshot back to the AI pick. */
  const resetCue = useEvent(() => {
    if (!selectedCue) return;
    const slot = selectedCue.slotIndex;
    if (selectedCue.kind === 'media') {
      onResetCue(slot);
      return;
    }
    const base = cues[String(slot)] ?? EMPTY_CUE;
    setCuePreview(null);
    onCueChange(slot, { ...base, text_start_ms: null, text_hold_ms: null });
    seek(slotSourceToTimelineMs(committed, slot, 0), true);
  });

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
      if (save && preview !== null) commitTimeline(preview);
      setPreview(null);
    } else if (tool === 'crop' && selected !== null) {
      if (save && liveCrop !== null) {
        const crop = clampCrop(liveCrop);
        commitTimeline(
          updatePiece(committed, selected.id, { crop: isIdentityCrop(crop) ? null : crop }),
        );
      }
      setLiveCrop(null);
    }
    setTool(null);
  }

  function toggleSelectedMuted() {
    if (!selected) return;
    commitTimeline(updatePiece(committed, selected.id, { muted: !selected.muted }));
  }

  function onTool(id: ToolId) {
    if (busy) return;
    switch (id) {
      case 'split':
        split();
        return;
      case 'delete':
        if (selectedBox !== null) deleteSelectedBox();
        else remove();
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
      case 'add-text':
        addText();
        return;
      case 'edit-text':
        if (selectedBox !== null) editBox(selectedBox.id);
        return;
      case 'text-color':
        if (storedBoxes.length === 0) return;
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
    clearStageSelection();
    history.undo();
  }

  function redo() {
    pause();
    setPreview(null);
    clearStageSelection();
    history.redo();
  }

  function continueToSend() {
    if (busy) return;
    pause();
    if (tool !== null) closeTool(true);
    persistence.flush();
    onContinue(preview ?? committed);
  }

  const speedCaption = useMemo(() => {
    if (!selected) return '';
    return `This clip plays for ${formatSeconds(pieceDurationMs(selected))}`;
  }, [selected]);

  const cueCaption = useMemo(() => {
    if (!selectedCue) return '';
    const slot = selectedCue.slotIndex;
    const range = slotTimelineRange(shown, slot);
    if (!range) return '';
    if (selectedCue.kind === 'media') {
      const at = slotSourceToTimelineMs(shown, slot, selectedCueValue?.media_start_ms ?? 0);
      return `Screenshot shows at ${formatSeconds(at - range.startMs)}`;
    }
    return 'Text shows for the whole clip';
  }, [selectedCue, selectedCueValue, shown]);

  const canResetCue =
    selectedCue !== null &&
    (selectedCue.kind === 'text' ||
      selectedCueValue === null ||
      selectedCueValue.source === 'creator');

  const editingBox =
    textEdit !== null && textEdit.boxId !== null
      ? docBoxes(doc, textEdit.segment, true).find((b) => b.id === textEdit.boxId) ?? null
      : null;

  const hint =
    tool === 'crop'
      ? 'Pinch to zoom, drag to reframe'
      : selectedBox !== null && tool === null
        ? 'Tap twice to edit the words'
        : insetSelected && insetShown && tool === null
          ? 'Drag to move, pinch to resize'
          : showPlaceHint && !playing && tool === null
            ? 'Drag text or pictures to move, pinch to resize'
            : null;

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: top + 8 }]}>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={managerMode ? 'Cancel and discard edits' : 'Back to camera'}
          onPress={onBack}
          disabled={busy}
          style={managerMode ? styles.textBtn : styles.roundBtn}
        >
          {managerMode ? (
            <Text style={styles.cancelText}>Cancel</Text>
          ) : (
            <Icon name="chevron-left" size={22} color={color.white} />
          )}
        </PressableScale>
        {speechPill ? (
          <View style={styles.speechPill} pointerEvents="none">
            <Text style={styles.hintText}>Trimmed to speech</Text>
          </View>
        ) : null}
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={managerMode ? 'Done editing' : 'Continue'}
          onPress={continueToSend}
          disabled={busy}
          style={[
            managerMode ? styles.doneBtn : [styles.roundBtn, styles.nextBtn],
            busy && styles.btnOff,
          ]}
        >
          {managerMode ? (
            <Text style={styles.doneText}>Done</Text>
          ) : (
            <Icon name="arrow-right" size={22} color={color.white} />
          )}
        </PressableScale>
      </View>

      <View style={styles.stageWrap}>
        <EditorStage
          ref={previewRef}
          timeline={nativeTimeline}
          playing={playing && !busy}
          onTime={onTime}
          onReady={onReady}
          onEnd={pause}
          onError={onPreviewError}
          onTogglePlay={onStagePress}
          onLayoutCard={setCardSize}
          cardSize={cardSize}
          segment={currentSegment}
          shot={currentShot}
          inset={currentInset}
          insetSelected={insetSelected && insetShown}
          boxes={currentBoxes}
          selectedBoxId={selectedBox?.id ?? null}
          showText={cueGate.showText}
          showMedia={cueGate.showMedia}
          subtitles={stageSubtitles}
          avoidBand={avoidBand}
          onSelectBox={selectBox}
          onEditBox={editBox}
          onCommitBox={commitBox}
          onSelectInset={selectInset}
          onCommitInset={commitInset}
          onMoveSubtitles={onMoveSubtitles}
          onDragStart={pause}
          crop={tool === 'crop' ? liveCrop : null}
          onCropChange={setLiveCrop}
          onCropCommit={setLiveCrop}
        />
        {hint !== null ? (
          <View style={styles.hint} pointerEvents="none">
            <Text style={styles.hintText}>{hint}</Text>
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

      <Text style={styles.slotLabel} numberOfLines={1}>
        {currentSlot?.label ?? ' '}
      </Text>

      <Timeline
        timeline={shown}
        playhead={playhead}
        playing={playing}
        selectedPieceId={selectedId}
        onSelectPiece={onSelectPiece}
        onScrubStart={onScrubStart}
        onScrub={onScrub}
        onScrubEnd={onScrubEnd}
        onTrimPreview={onTrimPreview}
        onTrimCommit={onTrimCommit}
        allMuted={allMuted}
        onToggleAllMuted={onToggleAllMuted}
        cueSlots={cueSlots}
        selectedCue={tool === 'cue' ? selectedCue : null}
        onSelectCue={selectCue}
        onCuePreview={previewCueDrag}
        onCueCommit={commitCueDrag}
      />

      <View style={[styles.tools, { height: TOOLS_H + bottom, paddingBottom: bottom }]}>
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
        ) : tool === 'text-color' && currentSegment !== null && storedBoxes.length > 0 ? (
          <ToolPanel
            title="Text color"
            onCancel={() => closeTool(false)}
            onDone={() => closeTool(true)}
          >
            <TextColorPicker
              key={currentSegment.id}
              boxes={storedBoxes}
              onChange={pickTextColor}
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
              sourceMs={cueStartMs(shown, selectedCue.slotIndex, selectedCueValue, selectedCue.kind)}
              kindLabel={cueCaption}
              pending={cuePendingSlots.includes(selectedCue.slotIndex)}
              canReset={canResetCue}
              resetLabel={selectedCue.kind === 'text' ? 'Reset to full clip' : 'Reset to AI'}
              onPickWord={pickCueWord}
              onReset={resetCue}
            />
          </ToolPanel>
        ) : (
          <EditorToolbar
            cutTools={!managerMode}
            canSplit={canSplit}
            hasSelection={selected !== null && !busy}
            canDelete={canDelete && !busy}
            selectedMuted={selected?.muted ?? false}
            canStyleText={storedBoxes.length > 0 && !busy}
            canAddText={canAddText}
            boxSelected={selectedBox !== null && !busy}
            insetSelected={insetSelected && insetShown && !busy}
            onTool={onTool}
          />
        )}
      </View>

      {textEdit !== null ? (
        <TextEditSheet
          initialText={editingBox?.text ?? ''}
          title={textEdit.boxId === null ? 'Add text' : 'Edit text'}
          bottomInset={bottom}
          onChange={setLiveDraft}
          onCancel={closeTextSheet}
          onSave={saveText}
        />
      ) : null}

      {error !== null ? (
        <View style={[styles.errorBar, { bottom: TOOLS_H + bottom + 12 }]}>
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
    paddingHorizontal: 12,
    paddingBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  roundBtn: {
    width: HEADER_H,
    height: HEADER_H,
    borderRadius: HEADER_H / 2,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextBtn: {
    backgroundColor: ARROW_RED,
  },
  textBtn: {
    minWidth: 64,
    height: HEADER_H,
    justifyContent: 'center',
  },
  cancelText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: type.size.bodySm,
    fontWeight: type.weight.bold,
  },
  doneBtn: {
    minWidth: 64,
    paddingHorizontal: 14,
    height: 32,
    borderRadius: 16,
    backgroundColor: color.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneText: {
    color: color.ink,
    fontSize: type.size.bodySm,
    fontWeight: type.weight.bold,
  },
  btnOff: {
    opacity: 0.4,
  },
  stageWrap: {
    flex: 1,
    paddingBottom: 4,
  },
  hint: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 18,
    alignItems: 'center',
  },
  speechPill: {
    flex: 1,
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
    height: 18,
  },
  tools: {
    paddingTop: 8,
    justifyContent: 'flex-start',
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
