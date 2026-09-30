// The creator's video editor, opened by the campaign manager on a submitted
// reel: the uploaded clips play in the real timeline, text boxes, inset
// pictures, subtitles and screenshot timing are edited on the same stage
// the creator used. Footage is never cut here. Every change saves as it
// happens through the manager's own row writes; Done flushes and asks for
// the re-render, Cancel puts every touched row back.
import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { color } from '../../../theme/tokens';

import { setSubmissionCues } from '../../../lib/admin-api';
import { parseTextOverlay, type Brief, type BriefSegment } from '../../../lib/briefs-api';
import type { Json } from '../../../lib/types';
import {
  identityTimeline,
  parseSlotCue,
  parseTranscriptWords,
  type SlotCue,
  type StoredCues,
  type StoredWords,
} from '../../../lib/video-edit';
import { PostEditor, type EditorSlot } from '../../creator/editor/PostEditor';
import {
  DEFAULT_INSET_WIDTH,
  DEFAULT_INSET_X,
  DEFAULT_INSET_Y,
} from '../../creator/editor/StageInset';
import type { SegmentWriter } from '../../creator/editor/useSegmentPersistence';
import type { ShotPreview } from '../../creator/SegmentOverlayPreview';
import { EditToast, type EditToastState } from './EditToast';
import { useReviewEdits, type EditSnapshot, type InsetDefaults } from './useReviewEdits';

export type ManagerClip = {
  slotIndex: number;
  label: string;
  /** Signed URL of the uploaded clip. */
  uri: string;
  durationMs: number;
  segment: BriefSegment | null;
};

const REEL_INSET_DEFAULTS: InsetDefaults = {
  x: DEFAULT_INSET_X,
  y: DEFAULT_INSET_Y,
  width: DEFAULT_INSET_WIDTH,
};
const CUE_SAVE_MS = 400;

function storedCues(raw: Json | null): StoredCues {
  const out: StoredCues = {};
  if (!Array.isArray(raw)) return out;
  for (const entry of raw) {
    const cue = parseSlotCue(entry);
    const slot = (entry as { slot_index?: unknown } | null)?.slot_index;
    if (cue !== null && typeof slot === 'number') out[String(slot)] = cue;
  }
  return out;
}

function storedWords(raw: Json | null): StoredWords {
  const out: StoredWords = {};
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return out;
  const clips = (raw as { clips?: unknown }).clips;
  if (!Array.isArray(clips)) return out;
  for (const clip of clips) {
    if (typeof clip !== 'object' || clip === null) continue;
    const { slot_index, words } = clip as { slot_index?: unknown; words?: unknown };
    if (typeof slot_index === 'number') out[String(slot_index)] = parseTranscriptWords(words);
  }
  return out;
}

function cuesJson(cues: StoredCues): Json {
  return Object.entries(cues)
    .map(([slot, cue]) => ({ ...cue, slot_index: Number(slot) }))
    .sort((a, b) => a.slot_index - b.slot_index) as unknown as Json;
}

function isVideoUrl(url: string): boolean {
  return /\.(mp4|mov|m4v|webm)(\?|#|$)/i.test(url.split('?')[0] ?? url);
}

export function ManagerVideoEditor(props: {
  brief: Brief;
  submissionId: string;
  clips: ManagerClip[];
  /** Signed URLs of inset pictures keyed by segment id. */
  insetUrls: Record<string, string>;
  cues: Json | null;
  transcript: Json | null;
  subtitlesY: number;
  onSubtitlesY: (y: number) => void;
  onSegments: (update: (prev: BriefSegment[]) => BriefSegment[]) => void;
  /** Pending saves are flushed first; resolves once the re-render is requested. */
  onDone: (changed: boolean) => Promise<void>;
  /** Touched rows are already restored; reload from the server and close. */
  onCancel: () => Promise<void>;
  topInset: number;
  bottomInset: number;
}): JSX.Element {
  const {
    brief,
    submissionId,
    clips,
    insetUrls,
    subtitlesY,
    onSubtitlesY,
    onSegments,
    onDone,
    onCancel,
    topInset,
    bottomInset,
  } = props;
  const [toast, setToast] = useState<EditToastState | null>(null);
  const [leaving, setLeaving] = useState<'done' | 'cancel' | null>(null);
  const [shots, setShots] = useState<Record<string, ShotPreview>>({});
  const [cues, setCues] = useState<StoredCues>(() => storedCues(props.cues));
  const words = useMemo(() => storedWords(props.transcript), [props.transcript]);

  const snapshot = useRef<EditSnapshot & { cues: Json | null }>({
    segments: clips.flatMap((c) => (c.segment ? [c.segment] : [])),
    subtitlesY,
    cues: props.cues,
  });
  const cuesDirty = useRef(false);
  const cueTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onError = useCallback(
    (message: string, retry: () => void) => setToast({ message, retry }),
    [],
  );
  const edits = useReviewEdits({ briefId: brief.id, onSegments, onError });

  // Inset pictures need their aspect for the stage; video insets keep the
  // signed URL as both poster and source.
  useEffect(() => {
    let cancelled = false;
    const entries = clips.flatMap((c) =>
      c.segment !== null && insetUrls[c.segment.id] !== undefined
        ? [[c.segment.id, insetUrls[c.segment.id]] as const]
        : [],
    );
    void Promise.all(
      entries.map(
        ([id, url]) =>
          new Promise<readonly [string, ShotPreview]>((resolve) => {
            if (isVideoUrl(url)) {
              resolve([id, { url, aspect: 9 / 16, videoUrl: url }]);
              return;
            }
            Image.getSize(
              url,
              (w, h) => resolve([id, { url, aspect: h > 0 ? w / h : 9 / 16 }]),
              () => resolve([id, { url, aspect: 9 / 16 }]),
            );
          }),
      ),
    ).then((list) => {
      if (!cancelled) setShots(Object.fromEntries(list));
    });
    return () => {
      cancelled = true;
    };
  }, [clips, insetUrls]);

  const slots = useMemo<EditorSlot[]>(
    () =>
      clips.map((c) => ({
        slotIndex: c.slotIndex,
        label: c.label,
        sourceUri: c.uri,
        durationMs: c.durationMs,
        segment: c.segment,
        shot: c.segment ? shots[c.segment.id] ?? null : null,
      })),
    [clips, shots],
  );
  const [initialTimeline] = useState(() =>
    identityTimeline(
      clips.map((c) => ({ slotIndex: c.slotIndex, sourceUri: c.uri, durationMs: c.durationMs })),
    ),
  );

  const segmentById = useMemo(() => {
    const map = new Map<string, BriefSegment>();
    for (const c of clips) if (c.segment) map.set(c.segment.id, c.segment);
    return map;
  }, [clips]);
  const latestSegments = useRef(segmentById);
  useEffect(() => {
    latestSegments.current = segmentById;
  }, [segmentById]);

  // The editor's own debounced saves land on the manager's row writes, which
  // carry the retry toast and the Cancel snapshot.
  const writer = useMemo<SegmentWriter>(
    () => ({
      boxes: (segmentId, boxes) => {
        const segment = latestSegments.current.get(segmentId);
        if (segment) edits.updateBoxes(segment, () => boxes);
        return Promise.resolve();
      },
      inset: (segmentId, placement) => {
        const segment = latestSegments.current.get(segmentId);
        if (segment) edits.placeInset(segment, placement, REEL_INSET_DEFAULTS);
        return Promise.resolve();
      },
    }),
    [edits],
  );

  const saveCues = useCallback(
    (next: StoredCues) => {
      cuesDirty.current = true;
      if (cueTimer.current !== null) clearTimeout(cueTimer.current);
      const run = () => {
        cueTimer.current = null;
        setSubmissionCues(submissionId, cuesJson(next)).catch(() =>
          setToast({ message: 'Could not save that timing.', retry: run }),
        );
      };
      cueTimer.current = setTimeout(run, CUE_SAVE_MS);
    },
    [submissionId],
  );

  const changeCue = (slotIndex: number, cue: SlotCue | null) => {
    setCues((prev) => {
      const next = { ...prev };
      if (cue === null) delete next[String(slotIndex)];
      else next[String(slotIndex)] = cue;
      saveCues(next);
      return next;
    });
  };

  /** Dropping the stored cue lets the render place the screenshot from the transcript again. */
  const resetCue = (slotIndex: number) => changeCue(slotIndex, null);

  const flushCues = async () => {
    if (cueTimer.current === null) return;
    clearTimeout(cueTimer.current);
    cueTimer.current = null;
    await setSubmissionCues(submissionId, cuesJson(cues));
  };

  const finish = async () => {
    if (leaving !== null) return;
    setLeaving('done');
    setToast(null);
    try {
      await Promise.all([edits.flush(), flushCues()]);
      await onDone(edits.isDirty() || cuesDirty.current);
    } catch {
      setLeaving(null);
      setToast({ message: 'Could not start the re-edit.', retry: () => void finish() });
    }
  };

  const cancel = async () => {
    if (leaving !== null) return;
    setLeaving('cancel');
    setToast(null);
    if (cueTimer.current !== null) clearTimeout(cueTimer.current);
    const restores: Promise<void>[] = [edits.discard(snapshot.current)];
    if (cuesDirty.current) {
      restores.push(setSubmissionCues(submissionId, snapshot.current.cues).catch(() => undefined));
    }
    await Promise.all(restores);
    await onCancel();
  };

  const styleBoxes = (boxColor: string, bg: boolean) => {
    for (const segment of latestSegments.current.values()) {
      edits.updateBoxes(segment, (boxes) => boxes.map((b) => ({ ...b, color: boxColor, bg })));
    }
  };

  return (
    <View style={styles.root}>
      <PostEditor
        mode="manager"
        segmentWriter={writer}
        slots={slots}
        initialTimeline={initialTimeline}
        trimmedToSpeech={false}
        overlay={parseTextOverlay(brief.text_overlay)}
        subtitles={brief.subtitles ? { y: subtitlesY } : null}
        onTimelineChange={() => undefined}
        onMoveBox={() => undefined}
        onStyleBox={(_segment, _boxId, boxColor, bg) => styleBoxes(boxColor, bg)}
        onMoveCard={() => undefined}
        onMoveSubtitles={(y) => {
          onSubtitlesY(y);
          edits.placeSubtitles(y);
        }}
        cues={cues}
        words={words}
        cuePendingSlots={[]}
        onCueChange={changeCue}
        onResetCue={resetCue}
        onBack={() => void cancel()}
        onReplaceSlot={() => undefined}
        onContinue={() => void finish()}
        busyLabel={
          leaving === 'done' ? 'Starting the re-edit…' : leaving === 'cancel' ? 'Putting it back…' : null
        }
        showPlaceHint={false}
        topInset={topInset}
        bottomInset={bottomInset}
      />
      <EditToast toast={toast} bottom={bottomInset + 160} onDismiss={() => setToast(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    backgroundColor: color.ink900,
  },
});
