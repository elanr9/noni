import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  CameraView,
  useCameraPermissions,
  useMicrophonePermissions,
  type CameraType,
} from 'expo-camera';
import * as Brightness from 'expo-brightness';
import { useVideoPlayer, VideoView } from 'expo-video';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FormatTag, TypeTag } from '../../../components/creator/Chips';
import { usePostTypeMeta } from '../../../components/creator/PostCard';
import {
  CameraRail,
  useDoubleTap,
  type PrompterSpeed,
} from '../../../components/creator/record/CameraRail';
import {
  lensForZoom,
  useBackLenses,
} from '../../../components/creator/record/useBackLenses';
import {
  GreenScreenBackdrop,
  SegmentOverlayPreview,
  type ShotPreview,
} from '../../../components/creator/SegmentOverlayPreview';
import { TeleprompterOverlay } from '../../../components/creator/TeleprompterOverlay';
import {
  isClipJoinerAvailable,
  joinClips,
} from '../../../modules/clip-joiner';
import {
  exportTimeline,
  isVideoEditorAvailable,
  toNativeTimeline,
} from '../../../modules/video-editor';
import {
  PostEditor,
  type EditorSlot,
} from '../../../components/creator/editor/PostEditor';
import { SheetShell } from '../../../components/ui/SheetShell';
import {
  replaceSlot,
  serializeEdits,
  slotIndices,
  slotIsUntouched,
  slotPieces,
  timelineFromStored,
  type EditTimeline,
  type StoredEdits,
} from '../../../lib/video-edit';
import { useCreatorToast } from '../../../components/creator/Toast';
import { parseChangesNote } from '../../../components/ReviewThread';
import { SoftToast } from '../../../components/states';
import { SkeletonCard } from '../../../components/ui/Skeleton';
import { Icon } from '../../../components/ui/Icon';
import { PressableScale } from '../../../components/ui/PressableScale';
import { color, motion, radius, space, type } from '../../../theme/tokens';
import { useAuth } from '../../../lib/auth';
import {
  DEFAULT_SUBTITLES_Y,
  creatorPlaceSegment,
  creatorPlaceSubtitles,
  listBriefSegments,
  parseHookOptions,
  parseTalkingPoints,
  parseTextOverlay,
  segmentWithBoxMoved,
  signedScreenshotUrl,
  type BriefSegment,
} from '../../../lib/briefs-api';
import { useCreatorQueue } from '../../../lib/creator-queue';
import { parseOverlayBoxes } from '../../../lib/overlay-boxes';
import {
  latestChangesNote,
  listAssignmentReviewEvents,
} from '../../../lib/review-events';
import {
  getAssignment,
  getTask,
  type AssignmentWithBrief,
  type Brief,
} from '../../../lib/tasks-api';
import {
  clearDraft,
  loadDraftEdits,
  loadDraftSegments,
  saveDraftEdits,
  saveDraftSegment,
  type DraftSegment,
  type DraftSegmentKind,
} from '../../../lib/recording-drafts';
import {
  draftClipPath,
  probeDurationMs,
  submitAssignmentClips,
  submitRecording,
  uploadClip,
} from '../../../lib/submissions';
import { supabase } from '../../../lib/supabase';
import type { ContentTask } from '../../../lib/tasks';
import { flaggedSlotIndices } from './flagged';

type Phase =
  | 'idle'
  | 'countdown'
  | 'recording'
  | 'between'
  | 'processing'
  | 'review';

type ClipPlan = {
  slotIndex: number;
  kind: DraftSegmentKind;
  label: string;
  chip: string;
  script: string;
  scripted: boolean;
};

type KeptClip = {
  slotIndex: number;
  kind: DraftSegmentKind;
  durationMs: number;
  storagePath: string | null;
  localUri: string | null;
};

type PendingClip = { uri: string; durationMs: number };

type EditorClip = Pick<EditorSlot, 'slotIndex' | 'label' | 'sourceUri' | 'durationMs'>;

const COUNTDOWN_STEP_MS = 800;
const SPEEDS: PrompterSpeed[] = [0.75, 1, 1.25, 1.5];
/** The visual fill reference: the current segment fills by elapsed / 20s. */
const PROGRESS_REF_MS = 20_000;
const PROCESSING_MIN_MS = 2_000;
const STOP_WATCHDOG_MS = 5_000;
const RECORD_ARM_MS = 350;
/** Time for the capture session to settle after a lens or facing swap. */
const SWITCH_SETTLE_MS = 450;
const OUTRO_FALLBACK = 'Close it out and tell them what to do next.';

function splitScriptParts(script: string): string[] {
  const byMarker = script
    .split(/\n\s*-{3,}\s*\n?/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (byMarker.length > 1) return byMarker;
  const byParagraph = script
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  return byParagraph.length > 0 ? byParagraph : [script];
}

function scriptPartsPlan(script: string): ClipPlan[] {
  const parts = splitScriptParts(script);
  return parts.map((part, i) => ({
    slotIndex: i,
    kind: 'point',
    label: parts.length === 1 ? 'Script' : `Part ${i + 1}`,
    chip: parts.length === 1 ? 'Script' : String(i + 1),
    script: part,
    scripted: true,
  }));
}

function briefPlan(brief: Brief, segments: BriefSegment[]): ClipPlan[] {
  if (brief.format === 'photo_carousel') {
    return scriptPartsPlan(
      brief.script?.trim() || 'No script on this post. Speak freely.',
    );
  }
  const talkingPoints = parseTalkingPoints(brief.talking_points);
  const spokenPoints = talkingPoints
    .map((p) => ({ text: p.text?.trim() ?? '', scripted: p.script === true }))
    .filter((p) => p.text.length > 0);
  const hookLine =
    brief.hook?.trim() || parseHookOptions(brief.hook_options)[0]?.trim() || '';
  const ctaLine = brief.cta?.trim() || '';

  const videoSegments = segments.filter((s) => s.kind !== 'slide');
  if (videoSegments.length > 0) {
    let pointNumber = 0;
    return videoSegments.map((s) => {
      if (s.kind === 'hook') {
        return {
          slotIndex: s.slot_index,
          kind: 'hook' as const,
          label: 'Hook',
          chip: 'Hook',
          script: hookLine || s.overlay_text?.trim() || '',
          scripted: true,
        };
      }
      if (s.kind === 'outro') {
        return {
          slotIndex: s.slot_index,
          kind: 'outro' as const,
          label: 'CTA',
          chip: 'CTA',
          script: ctaLine || OUTRO_FALLBACK,
          scripted: true,
        };
      }
      pointNumber += 1;
      const pointIndex = s.talking_point_index ?? pointNumber - 1;
      const point = talkingPoints[pointIndex];
      const text = point?.text?.trim() || s.overlay_text?.trim() || '';
      return {
        slotIndex: s.slot_index,
        kind: 'point' as const,
        label: `Point ${pointNumber}`,
        chip: String(pointNumber),
        script: text,
        scripted: point?.script === true,
      };
    });
  }

  if (spokenPoints.length > 0) {
    const plan: ClipPlan[] = [];
    if (hookLine) {
      plan.push({
        slotIndex: plan.length,
        kind: 'hook',
        label: 'Hook',
        chip: 'Hook',
        script: hookLine,
        scripted: true,
      });
    }
    spokenPoints.forEach((point, i) => {
      plan.push({
        slotIndex: plan.length,
        kind: 'point',
        label: `Point ${i + 1}`,
        chip: String(i + 1),
        script: point.text,
        scripted: point.scripted,
      });
    });
    if (ctaLine) {
      plan.push({
        slotIndex: plan.length,
        kind: 'outro',
        label: 'CTA',
        chip: 'CTA',
        script: ctaLine,
        scripted: true,
      });
    }
    return plan;
  }

  return scriptPartsPlan(
    brief.script?.trim() || 'No script on this post. Speak freely.',
  );
}

function formatMs(ms: number): string {
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

async function signedVideoUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from('videos')
    .createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}

/** 54px ring spinning 900ms linear (SCREENS §3 processing). */
function SpinnerRing() {
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 900,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [spin]);
  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });
  return (
    <Animated.View style={[styles.spinnerRing, { transform: [{ rotate }] }]} />
  );
}

export default function RecordScreen() {
  const { id, assignment: assignmentFlag } = useLocalSearchParams<{
    id: string;
    assignment?: string;
  }>();
  const isAssignment = assignmentFlag === '1';
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const queue = useCreatorQueue();
  const toast = useCreatorToast();
  const cameraRef = useRef<CameraView>(null);

  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();

  const [task, setTask] = useState<ContentTask | null>(null);
  const [assignment, setAssignment] = useState<AssignmentWithBrief | null>(null);
  const [briefSegments, setBriefSegments] = useState<BriefSegment[]>([]);
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<Phase>('idle');
  const [countdown, setCountdown] = useState(3);
  const [cameraReady, setCameraReady] = useState(false);
  const [facing, setFacing] = useState<CameraType>('front');
  const [flashOn, setFlashOn] = useState(false);
  const [zoom, setZoom] = useState<0.5 | 1>(1);
  const [kept, setKept] = useState<Record<number, KeptClip>>({});
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [, setPendingClip] = useState<PendingClip | null>(null);
  const [pendingSaved, setPendingSaved] = useState(false);
  const [pendingThumb, setPendingThumb] = useState<string | null>(null);
  const [pendingDurationMs, setPendingDurationMs] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [speed, setSpeed] = useState<PrompterSpeed>(1);
  const [takeCount, setTakeCount] = useState(0);
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const [stageSize, setStageSize] = useState<{ w: number; h: number } | null>(null);
  const [shots, setShots] = useState<Record<string, ShotPreview>>({});

  // Review player state.
  const [reviewUris, setReviewUris] = useState<string[]>([]);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [reviewPlaying, setReviewPlaying] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [placedOnce, setPlacedOnce] = useState(false);
  const [reviewCardSize, setReviewCardSize] = useState<{
    w: number;
    h: number;
  } | null>(null);
  const reviewSheet = useRef(new Animated.Value(0)).current;

  // Video editor (iOS with the native module): slots fed to the editor, the
  // latest committed timeline, stored edits from the draft, and the send step.
  const useEditor = Platform.OS === 'ios' && isVideoEditorAvailable();
  const [editorClips, setEditorClips] = useState<EditorClip[]>([]);
  const [editorInitial, setEditorInitial] = useState<EditTimeline | null>(null);
  const [editorSession, setEditorSession] = useState(0);
  const [sendOpen, setSendOpen] = useState(false);
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [subtitlesY, setSubtitlesY] = useState<number>(DEFAULT_SUBTITLES_Y);
  const editorTimelineRef = useRef<EditTimeline | null>(null);
  const storedEditsRef = useRef<StoredEdits>({});
  const signedUrlCache = useRef<Record<string, string>>({});
  const editsSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const returnToEditorRef = useRef(false);

  const recordingRef = useRef(false);
  const discardClipRef = useRef(false);
  const recordStartedRef = useRef(false);
  // A flip or lens swap ends the native recording, so one clip is captured
  // as parts that get joined into a single file when the creator stops.
  const partsRef = useRef<PendingClip[]>([]);
  const switchingRef = useRef(false);
  const stopWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevBrightnessRef = useRef<number | null>(null);
  const saveTokenRef = useRef(0);

  const brief = isAssignment ? assignment?.briefs ?? null : null;
  const typeMeta = usePostTypeMeta(brief?.post_type_id ?? null);

  const plan = useMemo<ClipPlan[]>(() => {
    if (brief) return briefPlan(brief, briefSegments);
    if (task) {
      return scriptPartsPlan(
        task.script?.trim() || 'No script on this task. Speak freely.',
      );
    }
    return [];
  }, [brief, briefSegments, task]);

  const editorSlots = useMemo<EditorSlot[]>(
    () =>
      editorClips.map((clip) => {
        const segment =
          briefSegments.find((s) => s.slot_index === clip.slotIndex) ?? null;
        return { ...clip, segment, shot: segment ? shots[segment.id] ?? null : null };
      }),
    [editorClips, briefSegments, shots],
  );

  const activeClip = activeIndex !== null ? plan[activeIndex] ?? null : null;
  const activeSegment = activeClip
    ? briefSegments.find((s) => s.slot_index === activeClip.slotIndex) ?? null
    : null;
  const activeShot = activeSegment ? shots[activeSegment.id] ?? null : null;
  const greenScreenActive =
    activeSegment?.layout === 'green_screen' && activeShot !== null;
  const keptCount = plan.filter((c) => kept[c.slotIndex] !== undefined).length;
  const clipsLeft = plan.length - keptCount;

  const reviewSource = phase === 'review' ? reviewUris[reviewIndex] ?? null : null;
  const reviewPlayer = useVideoPlayer(reviewSource, (p) => {
    p.loop = false;
  });

  // The review clips follow plan order, so the playing clip maps back to
  // its segment and the manager's overlays render on the playback too.
  const reviewClips = useMemo(
    () => plan.filter((c) => kept[c.slotIndex] !== undefined),
    [plan, kept],
  );
  const reviewSegment =
    phase === 'review'
      ? briefSegments.find(
          (s) => s.slot_index === reviewClips[reviewIndex]?.slotIndex,
        ) ?? null
      : null;
  const reviewShot = reviewSegment ? shots[reviewSegment.id] ?? null : null;

  // Chain the kept clips: when one ends, roll to the next.
  useEffect(() => {
    if (phase !== 'review') return;
    const sub = reviewPlayer.addListener('playToEnd', () => {
      setReviewIndex((i) => {
        const next = i + 1;
        if (next < reviewUris.length) return next;
        setReviewPlaying(false);
        return 0;
      });
    });
    return () => sub.remove();
  }, [phase, reviewPlayer, reviewUris.length]);

  useEffect(() => {
    if (phase !== 'review' || !reviewPlaying || reviewSource === null) return;
    reviewPlayer.play();
  }, [phase, reviewPlaying, reviewSource, reviewPlayer]);

  useEffect(() => {
    if (!id || !profile) return;
    let cancelled = false;
    async function load() {
      try {
        if (isAssignment) {
          const a = await getAssignment(id);
          if (cancelled) return;
          if (
            a &&
            a.briefs.format === 'photo_carousel' &&
            a.briefs.post_type_id !== null
          ) {
            router.replace({
              pathname: '/(creator)/upload/[id]',
              params: { id },
            });
            return;
          }
          setAssignment(a);
          if (a) setSubtitlesY(a.briefs.subtitles_y ?? DEFAULT_SUBTITLES_Y);
          if (a && profile) {
            const [segs, draft, events, edits] = await Promise.all([
              listBriefSegments(a.briefs.id),
              loadDraftSegments(profile.company_id, a.id),
              a.status === 'changes_requested'
                ? listAssignmentReviewEvents(a.id)
                : Promise.resolve([]),
              loadDraftEdits(profile.company_id, a.id).catch(() => ({}) as StoredEdits),
            ]);
            if (cancelled) return;
            storedEditsRef.current = edits;
            setBriefSegments(segs);
            const derivedPlan = briefPlan(a.briefs, segs);
            let skipSlots = new Set<number>();
            if (a.status === 'changes_requested') {
              const note = latestChangesNote(events);
              if (note) {
                const flagged = flaggedSlotIndices(
                  parseChangesNote(note),
                  derivedPlan,
                );
                if (flagged) skipSlots = new Set(flagged);
                else skipSlots = new Set(derivedPlan.map((c) => c.slotIndex));
              }
            }
            const resumed: Record<number, KeptClip> = {};
            for (const s of draft) {
              if (skipSlots.has(s.slot_index)) continue;
              resumed[s.slot_index] = {
                slotIndex: s.slot_index,
                kind: s.kind,
                durationMs: s.duration_ms,
                storagePath: s.storage_path,
                localUri: null,
              };
            }
            setKept(resumed);
          }
        } else {
          const t = await getTask(id);
          if (cancelled) return;
          setTask(t);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isAssignment, profile?.id]);

  useEffect(() => {
    if (loading || initialized || plan.length === 0) return;
    const first = plan.findIndex((c) => kept[c.slotIndex] === undefined);
    setActiveIndex(first === -1 ? 0 : first);
    setInitialized(true);
  }, [loading, initialized, plan, kept]);

  // Sign the brief's screenshots so the live preview shows the pre-placed
  // assets exactly where the final edit will put them. Video attachments
  // preview through a poster frame since Image cannot render an mp4.
  useEffect(() => {
    const withShots = briefSegments.filter((s) => s.screenshot_url);
    if (withShots.length === 0) return;
    let cancelled = false;
    void Promise.all(
      withShots.map(async (s) => {
        const path = s.screenshot_url as string;
        const signed = await signedScreenshotUrl(path);
        let url = signed;
        let videoUrl: string | undefined;
        if (/\.(mp4|mov|m4v|webm)(\?|#|$)/i.test(path)) {
          videoUrl = signed;
          try {
            const t = await VideoThumbnails.getThumbnailAsync(signed, { time: 0 });
            url = t.uri;
          } catch {
            // keep the signed URL; the card just stays blank
          }
        }
        const aspect = await new Promise<number>((resolve) => {
          Image.getSize(
            url,
            (w, h) => resolve(h > 0 ? w / h : 9 / 16),
            () => resolve(9 / 16),
          );
        });
        const shot: ShotPreview = videoUrl ? { url, aspect, videoUrl } : { url, aspect };
        return [s.id, shot] as const;
      }),
    )
      .then((entries) => {
        if (!cancelled) setShots(Object.fromEntries(entries));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [briefSegments]);

  useEffect(() => {
    if (phase !== 'countdown') return;
    if (countdown <= 0) {
      void startClip();
      return;
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), COUNTDOWN_STEP_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, countdown]);

  useEffect(() => {
    if (phase !== 'recording') return;
    const startedAt = Date.now();
    const t = setInterval(() => setElapsedMs(Date.now() - startedAt), 250);
    return () => clearInterval(t);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'review') {
      reviewSheet.setValue(0);
      return;
    }
    Animated.timing(reviewSheet, {
      toValue: 1,
      duration: motion.base,
      easing: motion.easeOut,
      useNativeDriver: true,
    }).start();
  }, [phase, reviewSheet]);

  useEffect(() => {
    return () => {
      void restoreBrightness();
    };
  }, []);

  // Ask for camera + mic as soon as the record screen opens, and only mount
  // CameraView after both are granted. Mounting without permission leaves a
  // black preview and onCameraReady never fires, so the shutter stays dead.
  useEffect(() => {
    void (async () => {
      if (!cameraPermission?.granted) await requestCameraPermission();
      if (!micPermission?.granted) await requestMicPermission();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const permissionsGranted = Boolean(
    cameraPermission?.granted && micPermission?.granted,
  );

  // Keep CameraView mounted across capture phases so the session stays warm.
  const capturePhase =
    phase === 'idle' ||
    phase === 'countdown' ||
    phase === 'recording' ||
    phase === 'between';
  const cameraMounted = permissionsGranted && activeClip !== null && capturePhase;

  useEffect(() => {
    if (!permissionsGranted) setCameraReady(false);
  }, [permissionsGranted]);

  // Facing and lens swaps reconfigure the live session in place (no remount),
  // so onCameraReady only fires once per mount.
  useEffect(() => {
    if (!cameraMounted) setCameraReady(false);
  }, [cameraMounted]);

  const lenses = useBackLenses(cameraRef, facing, cameraReady);
  const selectedLens =
    facing === 'back' ? lensForZoom(zoom, lenses) : undefined;

  async function restoreBrightness() {
    const prev = prevBrightnessRef.current;
    prevBrightnessRef.current = null;
    if (prev === null) return;
    try {
      await Brightness.setBrightnessAsync(prev);
    } catch {
      // brightness reverts on lock anyway
    }
  }

  async function ensurePermissions(): Promise<boolean> {
    const cam = cameraPermission?.granted
      ? cameraPermission
      : await requestCameraPermission();
    const mic = micPermission?.granted
      ? micPermission
      : await requestMicPermission();
    return Boolean(cam?.granted && mic?.granted);
  }

  async function beginCountdown() {
    if (recordingRef.current || activeClip === null) return;
    const ok = await ensurePermissions();
    if (!ok) {
      Alert.alert(
        'Camera and mic needed',
        'Noni needs both to record your take with the teleprompter.',
      );
      return;
    }
    if (!cameraReady) {
      Alert.alert('Camera warming up', 'Give it a second, then tap again.');
      return;
    }
    setTakeCount((c) => c + 1);
    setCountdown(3);
    setPhase('countdown');
  }

  async function startClip() {
    const cam = cameraRef.current;
    if (!cam || recordingRef.current) {
      setPhase('idle');
      return;
    }
    if (!cameraReady) {
      setPhase('idle');
      Alert.alert('Camera warming up', 'Give it a second, then tap again.');
      return;
    }
    recordingRef.current = true;
    discardClipRef.current = false;
    recordStartedRef.current = false;
    switchingRef.current = false;
    partsRef.current = [];
    setElapsedMs(0);
    setPhase('recording');
    if (flashOn && facing === 'front') {
      try {
        prevBrightnessRef.current = await Brightness.getBrightnessAsync();
        await Brightness.setBrightnessAsync(1);
      } catch {
        prevBrightnessRef.current = null;
      }
    }
    // onCameraReady can fire before AVCaptureSession will accept recordAsync.
    await new Promise<void>((resolve) => setTimeout(resolve, RECORD_ARM_MS));
    if (!recordingRef.current || discardClipRef.current) {
      recordingRef.current = false;
      setPhase('idle');
      void restoreBrightness();
      return;
    }
    const startedAt = Date.now();
    try {
      recordStartedRef.current = true;
      let keepGoing = true;
      while (keepGoing) {
        const partStartedAt = Date.now();
        const part = await recordPart(cam);
        if (part?.uri) {
          partsRef.current.push({
            uri: part.uri,
            durationMs: Math.max(300, Date.now() - partStartedAt),
          });
        }
        keepGoing =
          switchingRef.current &&
          recordingRef.current &&
          !discardClipRef.current;
        if (keepGoing) {
          switchingRef.current = false;
          await new Promise<void>((resolve) =>
            setTimeout(resolve, SWITCH_SETTLE_MS),
          );
        }
      }
      const parts = partsRef.current;
      partsRef.current = [];
      if (discardClipRef.current) {
        discardClipRef.current = false;
        setPhase('idle');
      } else if (parts.length > 0) {
        const uri =
          parts.length === 1
            ? parts[0].uri
            : await joinClips(parts.map((p) => p.uri));
        const captured: PendingClip = {
          uri,
          durationMs: Math.max(500, Date.now() - startedAt),
        };
        setPendingClip(captured);
        setPendingSaved(false);
        setPendingThumb(null);
        setPendingDurationMs(captured.durationMs);
        setPhase('between');
        void VideoThumbnails.getThumbnailAsync(uri, { time: 0 })
          .then((t) => setPendingThumb(t.uri))
          .catch(() => undefined);
        void saveClip(captured);
      } else {
        setPhase('idle');
        Alert.alert('Clip not saved', 'That take did not save. Record it again.');
      }
    } catch (e) {
      setPhase('idle');
      Alert.alert(
        'Recording failed',
        e instanceof Error ? e.message : 'Try again',
      );
    } finally {
      recordingRef.current = false;
      if (stopWatchdogRef.current) {
        clearTimeout(stopWatchdogRef.current);
        stopWatchdogRef.current = null;
      }
      void restoreBrightness();
    }
  }

  function stopClip() {
    if (!recordingRef.current) return;
    if (!recordStartedRef.current) {
      discardClipRef.current = true;
      recordingRef.current = false;
      setPhase('idle');
      void restoreBrightness();
      return;
    }
    cameraRef.current?.stopRecording();
    if (stopWatchdogRef.current) clearTimeout(stopWatchdogRef.current);
    stopWatchdogRef.current = setTimeout(() => {
      if (recordingRef.current) {
        discardClipRef.current = true;
        recordingRef.current = false;
        setPhase('idle');
        void restoreBrightness();
        Alert.alert(
          'Camera stalled',
          'That clip could not be saved. Record it again.',
        );
      }
    }, STOP_WATCHDOG_MS);
  }

  /** One native recording. Right after a lens swap the session can still be
   * reconfiguring, so a failed start gets a single retry. */
  async function recordPart(cam: CameraView): Promise<{ uri: string } | undefined> {
    try {
      return await cam.recordAsync();
    } catch (e) {
      if (partsRef.current.length === 0) throw e;
      await new Promise<void>((resolve) => setTimeout(resolve, SWITCH_SETTLE_MS));
      return await cam.recordAsync();
    }
  }

  /** Flip or lens change. Mid-recording it cuts the current part, swaps the
   * device and the loop in startClip picks the recording back up. */
  function switchDevice(apply: () => void) {
    if (phase === 'recording') {
      if (!recordingRef.current || !recordStartedRef.current) return;
      if (switchingRef.current) return;
      if (!isClipJoinerAvailable()) {
        setErrorToast('Update Noni to switch cameras while recording.');
        return;
      }
      switchingRef.current = true;
      apply();
      cameraRef.current?.stopRecording();
      return;
    }
    if (phase === 'idle') apply();
  }

  function flipCamera() {
    switchDevice(() => {
      setFacing((f) => (f === 'front' ? 'back' : 'front'));
      setZoom(1);
    });
  }

  function toggleZoom() {
    if (facing !== 'back' || !lenses.hasUltraWide) return;
    switchDevice(() => setZoom((z) => (z === 1 ? 0.5 : 1)));
  }

  function cycleSpeed() {
    setSpeed((s) => SPEEDS[(SPEEDS.indexOf(s) + 1) % SPEEDS.length]);
  }

  const onStagePress = useDoubleTap(flipCamera);

  /** Stop saves this clip: probe, upload the draft, keep the slot. */
  async function saveClip(captured: PendingClip) {
    if (!profile || activeClip === null) return;
    const token = ++saveTokenRef.current;
    try {
      const durationMs = await probeDurationMs(captured.uri, captured.durationMs);
      let storagePath: string | null = null;
      if (assignment) {
        storagePath = draftClipPath(
          profile.company_id,
          assignment.id,
          activeClip.slotIndex,
        );
        await uploadClip(captured.uri, storagePath);
        const segment: DraftSegment = {
          slot_index: activeClip.slotIndex,
          kind: activeClip.kind,
          storage_path: storagePath,
          duration_ms: durationMs,
        };
        await saveDraftSegment({
          companyId: profile.company_id,
          assignmentId: assignment.id,
          creatorId: profile.id,
          segment,
        });
      }
      if (saveTokenRef.current !== token) return;
      setKept((prev) => ({
        ...prev,
        [activeClip.slotIndex]: {
          slotIndex: activeClip.slotIndex,
          kind: activeClip.kind,
          durationMs,
          storagePath,
          localUri: captured.uri,
        },
      }));
      setPendingDurationMs(durationMs);
      setPendingSaved(true);
    } catch (e) {
      if (saveTokenRef.current !== token) return;
      setPendingClip(null);
      setPhase('idle');
      setErrorToast(
        e instanceof Error
          ? e.message
          : 'Could not save the clip. Check your connection and try again.',
      );
    }
  }

  function redoClip() {
    saveTokenRef.current += 1;
    setPendingClip(null);
    setPendingSaved(false);
    setPhase('idle');
  }

  function nextClip() {
    setPendingClip(null);
    if (returnToEditorRef.current) {
      returnToEditorRef.current = false;
      void processPost();
      return;
    }
    const next = plan.findIndex((c) => kept[c.slotIndex] === undefined);
    if (next !== -1) setActiveIndex(next);
    setPhase('idle');
  }

  async function clipUri(k: KeptClip): Promise<string> {
    if (k.localUri !== null) return k.localUri;
    if (k.storagePath !== null) {
      const cached = signedUrlCache.current[k.storagePath];
      if (cached !== undefined) return cached;
      const url = await signedVideoUrl(k.storagePath);
      signedUrlCache.current[k.storagePath] = url;
      return url;
    }
    throw new Error('A clip is missing. Record it again.');
  }

  /** Build the editor's slots and reconcile the last timeline with the clips
   * that exist now: a re-recorded slot drops its old cuts, missing slots go. */
  function prepareEditor(clips: KeptClip[], uris: string[]) {
    const inputs = clips.map((k, i) => ({
      slotIndex: k.slotIndex,
      sourceUri: uris[i],
      durationMs: k.durationMs,
    }));
    let timeline = editorTimelineRef.current;
    if (timeline === null) {
      timeline = timelineFromStored(inputs, storedEditsRef.current);
    } else {
      for (const input of inputs) {
        const pieces = slotPieces(timeline, input.slotIndex);
        const same =
          pieces.length > 0 &&
          pieces[0].sourceUri === input.sourceUri &&
          pieces[0].sourceDurationMs === input.durationMs;
        if (!same) timeline = replaceSlot(timeline, input);
      }
      const present = new Set(inputs.map((s) => s.slotIndex));
      timeline = { pieces: timeline.pieces.filter((p) => present.has(p.slotIndex)) };
    }
    editorTimelineRef.current = timeline;
    setEditorClips(
      inputs.map((input) => ({
        slotIndex: input.slotIndex,
        label:
          plan.find((c) => c.slotIndex === input.slotIndex)?.label ??
          `Clip ${input.slotIndex + 1}`,
        sourceUri: input.sourceUri,
        durationMs: input.durationMs,
      })),
    );
    setEditorInitial(timeline);
    setEditorSession((n) => n + 1);
  }

  async function processPost() {
    setPendingClip(null);
    setPhase('processing');
    const startedAt = Date.now();
    try {
      const clips = plan
        .filter((c) => kept[c.slotIndex] !== undefined)
        .map((c) => kept[c.slotIndex]);
      const uris = await Promise.all(clips.map(clipUri));
      const waitLeft = PROCESSING_MIN_MS - (Date.now() - startedAt);
      if (waitLeft > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, waitLeft));
      }
      if (useEditor) {
        prepareEditor(clips, uris);
        setReviewUris([]);
      } else {
        setReviewUris(uris);
      }
      setReviewIndex(0);
      setReviewPlaying(false);
      setPhase('review');
    } catch (e) {
      setPhase('idle');
      setErrorToast(
        e instanceof Error ? e.message : 'Could not load your clips. Try again.',
      );
    }
  }

  const persistEdits = useCallback(
    (timeline: EditTimeline) => {
      editorTimelineRef.current = timeline;
      if (!profile || !assignment) return;
      if (editsSaveTimer.current) clearTimeout(editsSaveTimer.current);
      const edits = serializeEdits(timeline);
      storedEditsRef.current = edits;
      editsSaveTimer.current = setTimeout(() => {
        editsSaveTimer.current = null;
        saveDraftEdits({
          companyId: profile.company_id,
          assignmentId: assignment.id,
          creatorId: profile.id,
          edits,
        }).catch(() => undefined);
      }, 600);
    },
    [profile, assignment],
  );

  useEffect(() => {
    return () => {
      if (editsSaveTimer.current) clearTimeout(editsSaveTimer.current);
    };
  }, []);

  function replaceSlotFromEditor(slotIndex: number) {
    const index = plan.findIndex((c) => c.slotIndex === slotIndex);
    if (index === -1) return;
    returnToEditorRef.current = true;
    setActiveIndex(index);
    setPhase('idle');
  }

  function moveSubtitles(y: number) {
    setSubtitlesY(y);
    if (!brief) return;
    creatorPlaceSubtitles({ briefId: brief.id, y }).catch(() =>
      setErrorToast('Could not save that position. Try again.'),
    );
  }

  /** Bake every edited slot into a fresh clip, swap it into the kept map and
   * the draft, then hand the result to the normal submit path. */
  async function sendEdited() {
    if (!profile || submitting) return;
    const timeline = editorTimelineRef.current;
    if (!timeline) return;
    setSendOpen(false);
    // A pending debounced edits save could land mid export with stale
    // segments; every exported slot writes the draft itself below.
    if (editsSaveTimer.current) {
      clearTimeout(editsSaveTimer.current);
      editsSaveTimer.current = null;
    }
    const edited = slotIndices(timeline).filter((s) => !slotIsUntouched(timeline, s));
    const keptNow: Record<number, KeptClip> = { ...kept };
    let current = timeline;
    try {
      for (let i = 0; i < edited.length; i++) {
        const slot = edited[i];
        const before = keptNow[slot];
        if (before === undefined) continue;
        setBusyLabel(
          edited.length === 1
            ? 'Finishing your clip…'
            : `Finishing clip ${i + 1} of ${edited.length}…`,
        );
        const result = await exportTimeline(
          toNativeTimeline({ pieces: slotPieces(current, slot) }),
        );
        let storagePath = before.storagePath;
        if (assignment) {
          storagePath = draftClipPath(profile.company_id, assignment.id, slot);
          await uploadClip(result.uri, storagePath);
          await saveDraftSegment({
            companyId: profile.company_id,
            assignmentId: assignment.id,
            creatorId: profile.id,
            segment: {
              slot_index: slot,
              kind: before.kind,
              storage_path: storagePath,
              duration_ms: Math.round(result.durationMs),
            },
          });
        }
        keptNow[slot] = {
          ...before,
          durationMs: Math.round(result.durationMs),
          storagePath,
          localUri: result.uri,
        };
        current = replaceSlot(current, {
          slotIndex: slot,
          sourceUri: result.uri,
          durationMs: Math.round(result.durationMs),
        });
        editorTimelineRef.current = current;
        setKept({ ...keptNow });
        if (assignment) {
          await saveDraftEdits({
            companyId: profile.company_id,
            assignmentId: assignment.id,
            creatorId: profile.id,
            edits: serializeEdits(current),
          }).catch(() => undefined);
        }
      }
      setBusyLabel('Sending for approval…');
      await sendForApproval(keptNow);
    } catch (e) {
      setErrorToast(e instanceof Error ? e.message : 'Could not finish the video. Try again.');
    } finally {
      setBusyLabel(null);
    }
  }

  async function sendForApproval(keptOverride?: Record<number, KeptClip>) {
    if (!profile || submitting) return;
    const clips = keptOverride ?? kept;
    setSubmitting(true);
    try {
      if (assignment) {
        const uploaded = plan
          .filter((c) => clips[c.slotIndex] !== undefined)
          .map((c) => {
            const k = clips[c.slotIndex];
            if (k.storagePath === null) {
              throw new Error('A clip is missing. Record it again.');
            }
            return {
              slotIndex: k.slotIndex,
              storagePath: k.storagePath,
              durationMs: k.durationMs,
            };
          });
        const updated = await submitAssignmentClips({
          assignment,
          companyId: profile.company_id,
          creatorId: profile.id,
          clips: uploaded,
        });
        try {
          await clearDraft(profile.company_id, assignment.id);
        } catch {
          // submission is in; stale draft is harmless
        }
        queue.applyLocal(updated);
      } else if (task) {
        const segments = plan
          .filter((c) => clips[c.slotIndex] !== undefined)
          .map((c) => {
            const k = clips[c.slotIndex];
            if (k.localUri === null) {
              throw new Error('A clip is missing. Record it again.');
            }
            return { uri: k.localUri, durationMs: k.durationMs };
          });
        await submitRecording({
          task,
          companyId: profile.company_id,
          creatorId: profile.id,
          segments,
        });
      }
      toast.show('Sent for approval. It posts once approved.');
      router.replace('/(creator)/(tabs)');
    } catch (e) {
      setSubmitting(false);
      setErrorToast(e instanceof Error ? e.message : 'Upload failed. Try again.');
    }
  }

  function retakeFromReview() {
    reviewPlayer.pause();
    setReviewPlaying(false);
    setPhase('idle');
  }

  function toggleReviewPlay() {
    if (reviewPlaying) {
      reviewPlayer.pause();
      setReviewPlaying(false);
    } else {
      setReviewPlaying(true);
      reviewPlayer.play();
    }
  }

  function pauseReview() {
    reviewPlayer.pause();
    setReviewPlaying(false);
  }

  function goToReviewClip(index: number) {
    if (index < 0 || index >= reviewUris.length) return;
    pauseReview();
    setReviewIndex(index);
  }

  function persistPlacement(params: Parameters<typeof creatorPlaceSegment>[0]) {
    setPlacedOnce(true);
    creatorPlaceSegment(params).catch(() =>
      setErrorToast('Could not save that position. Try again.'),
    );
  }

  function moveReviewBox(boxId: string, x: number, y: number) {
    if (!reviewSegment) return;
    const segmentId = reviewSegment.id;
    setBriefSegments((prev) =>
      prev.map((s) => (s.id === segmentId ? segmentWithBoxMoved(s, boxId, x, y) : s)),
    );
    persistPlacement({ segmentId, box: { id: boxId, x, y } });
  }

  function moveReviewCard(x: number, y: number) {
    if (!reviewSegment) return;
    const segmentId = reviewSegment.id;
    setBriefSegments((prev) =>
      prev.map((s) =>
        s.id === segmentId ? { ...s, screenshot_x: x, screenshot_y: y } : s,
      ),
    );
    persistPlacement({ segmentId, screenshot: { x, y } });
  }

  const reviewCanPlace =
    reviewSegment !== null &&
    reviewSegment.layout !== 'green_screen' &&
    (reviewShot !== null ||
      (reviewSegment.show_on_screen &&
        parseTextOverlay(brief?.text_overlay).enabled &&
        parseOverlayBoxes(reviewSegment.overlay_style, {
          text: reviewSegment.overlay_text,
          textY: reviewSegment.text_y,
        }).length > 0));

  function onClose() {
    if (submitting) return;
    if (phase === 'countdown') {
      setPhase('idle');
      return;
    }
    if (phase === 'recording') {
      stopClip();
      return;
    }
    router.back();
  }

  function onShutterPress() {
    if (phase === 'idle') void beginCountdown();
  }

  if (loading) {
    return (
      <View style={styles.fallback}>
        <SkeletonCard style={styles.fallbackSkeleton} radius={radius.xl} />
      </View>
    );
  }
  if (isAssignment ? !assignment : !task) {
    return (
      <View style={styles.fallback}>
        <Text style={styles.fallbackText}>Task not found.</Text>
      </View>
    );
  }

  const frontGlow = phase === 'recording' && flashOn && facing === 'front';
  const needsPermissionGate =
    activeClip !== null && capturePhase && !permissionsGranted;
  const showPrompt =
    activeClip !== null &&
    (phase === 'idle' || phase === 'countdown' || phase === 'recording');
  const submitCount = keptCount;
  const clipNumber = (activeIndex ?? 0) + 1;
  const toGo = plan.filter(
    (c) =>
      kept[c.slotIndex] === undefined &&
      c.slotIndex !== (activeClip?.slotIndex ?? -1),
  ).length;

  const reviewData = brief ?? null;

  return (
    <View style={styles.root}>
      {phase === 'processing' ? (
        <View style={[styles.processing, { paddingTop: insets.top }]}>
          <SpinnerRing />
          <Text style={styles.processingTitle}>Processing your post…</Text>
          <Text style={styles.processingSub}>
            Stitching {submitCount} {submitCount === 1 ? 'clip' : 'clips'},
            adding your assets and captions.
          </Text>
        </View>
      ) : phase === 'review' && useEditor && editorInitial !== null ? (
        <PostEditor
          key={editorSession}
          slots={editorSlots}
          initialTimeline={editorInitial}
          overlay={parseTextOverlay(brief?.text_overlay)}
          subtitles={brief?.subtitles ? { y: subtitlesY } : null}
          onTimelineChange={persistEdits}
          onMoveBox={(segment, boxId, x, y) => {
            setBriefSegments((prev) =>
              prev.map((s) =>
                s.id === segment.id ? segmentWithBoxMoved(s, boxId, x, y) : s,
              ),
            );
            persistPlacement({ segmentId: segment.id, box: { id: boxId, x, y } });
          }}
          onMoveCard={(segment, x, y) => {
            setBriefSegments((prev) =>
              prev.map((s) =>
                s.id === segment.id ? { ...s, screenshot_x: x, screenshot_y: y } : s,
              ),
            );
            persistPlacement({ segmentId: segment.id, screenshot: { x, y } });
          }}
          onMoveSubtitles={moveSubtitles}
          onBack={retakeFromReview}
          onReplaceSlot={replaceSlotFromEditor}
          onContinue={(timeline) => {
            editorTimelineRef.current = timeline;
            setSendOpen(true);
          }}
          busyLabel={busyLabel ?? (submitting ? 'Sending for approval…' : null)}
          showPlaceHint={!placedOnce}
          topInset={insets.top}
          bottomInset={insets.bottom}
        />
      ) : phase === 'review' ? (
        <View style={[styles.review, { paddingTop: insets.top + space[2] }]}>
          <View style={styles.reviewHeader}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Retake"
              onPress={retakeFromReview}
              hitSlop={10}
            >
              <Text style={styles.reviewHeaderBtn}>Retake</Text>
            </Pressable>
            <Text style={styles.reviewHeaderTitle}>Review</Text>
            <View style={styles.reviewHeaderSpacer} />
          </View>

          <View style={styles.reviewStage}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={reviewPlaying ? 'Pause preview' : 'Play preview'}
              onPress={toggleReviewPlay}
              onLayout={(e) =>
                setReviewCardSize({
                  w: e.nativeEvent.layout.width,
                  h: e.nativeEvent.layout.height,
                })
              }
              style={styles.reviewCard}
            >
              {reviewSource !== null ? (
                <VideoView
                  style={StyleSheet.absoluteFill}
                  player={reviewPlayer}
                  contentFit="cover"
                  nativeControls={false}
                />
              ) : null}
              {reviewSegment !== null &&
              reviewCardSize !== null &&
              reviewSegment.layout !== 'green_screen' ? (
                <SegmentOverlayPreview
                  segment={reviewSegment}
                  shot={reviewShot}
                  stageWidth={reviewCardSize.w}
                  stageHeight={reviewCardSize.h}
                  overlay={parseTextOverlay(brief?.text_overlay)}
                  onMoveBox={moveReviewBox}
                  onMoveCard={moveReviewCard}
                  onDragStart={pauseReview}
                />
              ) : null}
              <View style={styles.reviewSegments}>
                {reviewUris.map((uri, i) => (
                  <Pressable
                    key={uri}
                    accessibilityRole="button"
                    accessibilityLabel={`Clip ${i + 1} of ${reviewUris.length}`}
                    hitSlop={{ top: 12, bottom: 16 }}
                    onPress={() => goToReviewClip(i)}
                    style={[
                      styles.reviewSegment,
                      i === reviewIndex || i < reviewIndex
                        ? styles.reviewSegmentOn
                        : null,
                    ]}
                  />
                ))}
              </View>
              {reviewUris.length > 1 ? (
                <View style={styles.reviewClipLabel} pointerEvents="none">
                  <Text style={styles.reviewClipLabelText}>
                    Clip {reviewIndex + 1} of {reviewUris.length}
                  </Text>
                </View>
              ) : null}
              {!reviewPlaying ? (
                <View style={styles.reviewPlayWrap} pointerEvents="none">
                  <View style={styles.reviewPlay}>
                    <Icon name="play" size={24} color={color.ink} />
                  </View>
                </View>
              ) : null}
              {!reviewPlaying && reviewIndex > 0 ? (
                <PressableScale
                  accessibilityRole="button"
                  accessibilityLabel="Previous clip"
                  onPress={() => goToReviewClip(reviewIndex - 1)}
                  style={[styles.reviewArrow, styles.reviewArrowLeft]}
                >
                  <Icon name="chevron-left" size={19} color={color.white} />
                </PressableScale>
              ) : null}
              {!reviewPlaying && reviewIndex < reviewUris.length - 1 ? (
                <PressableScale
                  accessibilityRole="button"
                  accessibilityLabel="Next clip"
                  onPress={() => goToReviewClip(reviewIndex + 1)}
                  style={[styles.reviewArrow, styles.reviewArrowRight]}
                >
                  <Icon name="chevron-right" size={19} color={color.white} />
                </PressableScale>
              ) : null}
              {reviewCanPlace && !placedOnce && !reviewPlaying ? (
                <View style={styles.placeHint} pointerEvents="none">
                  <Text style={styles.placeHintText}>
                    Hold any text or picture to move it
                  </Text>
                </View>
              ) : null}
            </Pressable>
          </View>

          <Animated.View
            style={[
              styles.reviewSheet,
              {
                paddingBottom: Math.max(insets.bottom, 14) + 6,
                transform: [
                  {
                    translateY: reviewSheet.interpolate({
                      inputRange: [0, 1],
                      outputRange: [220, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <Text style={styles.reviewLabel}>Autofilled from the brief</Text>
            <Text style={styles.reviewTitle} numberOfLines={2}>
              {reviewData?.title ?? task?.title ?? ''}
            </Text>
            <View style={styles.reviewChips}>
              {reviewData !== null ? (
                <FormatTag format={reviewData.format} />
              ) : null}
              {typeMeta !== null ? (
                <TypeTag label={typeMeta.label} typeKey={typeMeta.key} />
              ) : null}
            </View>
            {reviewData?.caption ? (
              <View style={styles.captionBlock}>
                <Text style={styles.captionLabel}>Caption</Text>
                <ScrollView
                  style={styles.captionScroll}
                  showsVerticalScrollIndicator={false}
                >
                  <Text style={styles.captionText}>{reviewData.caption}</Text>
                </ScrollView>
              </View>
            ) : null}
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="Send for approval"
              onPress={() => void sendForApproval()}
              disabled={submitting}
              style={[styles.sendBtn, submitting && styles.sendBtnOff]}
            >
              {submitting ? (
                <ActivityIndicator color={color.white} />
              ) : (
                <Icon name="send" size={19} color={color.white} />
              )}
              <Text style={styles.sendText}>
                {submitting ? 'Sending…' : 'Send for approval'}
              </Text>
            </PressableScale>
          </Animated.View>
        </View>
      ) : (
        <>
          <View
            style={styles.stage}
            onLayout={(e) =>
              setStageSize({
                w: e.nativeEvent.layout.width,
                h: e.nativeEvent.layout.height,
              })
            }
          >
            {cameraMounted ? (
              <Pressable
                accessibilityLabel="Camera preview. Double tap to flip."
                onPress={onStagePress}
                style={StyleSheet.absoluteFill}
              >
                <CameraView
                  ref={cameraRef}
                  style={StyleSheet.absoluteFill}
                  facing={facing}
                  selectedLens={selectedLens}
                  mode="video"
                  mute={false}
                  mirror={facing === 'front'}
                  videoQuality="720p"
                  enableTorch={flashOn && facing === 'back'}
                  onCameraReady={() => setCameraReady(true)}
                  onMountError={(e) => {
                    setCameraReady(false);
                    Alert.alert(
                      'Camera failed',
                      e.message ||
                        'Could not start the camera. Close and open this screen again.',
                    );
                  }}
                />
              </Pressable>
            ) : null}

            {greenScreenActive && activeShot ? (
              // The camera preview layer is never translucent on iOS, so the
              // green screen media sits over it instead of under it.
              <View style={styles.greenScreenLayer} pointerEvents="none">
                <GreenScreenBackdrop
                  shot={activeShot}
                  recording={phase === 'recording'}
                />
              </View>
            ) : null}

            {needsPermissionGate ? (
              <View style={styles.permissionGate}>
                <Text style={styles.permissionTitle}>Camera and mic needed</Text>
                <Text style={styles.permissionBody}>
                  Allow both so you can record each clip in Noni with the
                  teleprompter.
                </Text>
                <Pressable
                  style={styles.permissionBtn}
                  onPress={() => void ensurePermissions()}
                >
                  <Text style={styles.permissionBtnText}>Allow access</Text>
                </Pressable>
              </View>
            ) : null}

            {frontGlow ? (
              <View style={styles.frontGlow} pointerEvents="none" />
            ) : null}

            {activeSegment && stageSize && phase !== 'between' ? (
              <SegmentOverlayPreview
                segment={activeSegment}
                shot={activeShot}
                stageWidth={stageSize.w}
                stageHeight={stageSize.h}
                overlay={parseTextOverlay(brief?.text_overlay)}
                recording={phase === 'recording'}
              />
            ) : null}

            <View style={[styles.topBar, { paddingTop: insets.top + space[2] }]}>
              <View style={styles.progressRow}>
                {plan.map((c, i) => {
                  const isDone = kept[c.slotIndex] !== undefined;
                  const isActive = i === activeIndex;
                  const fill =
                    isActive && phase === 'recording'
                      ? Math.min(elapsedMs / PROGRESS_REF_MS, 1)
                      : 0;
                  return (
                    <View key={c.slotIndex} style={styles.progressTrack}>
                      {isDone ? (
                        <View style={styles.progressDone} />
                      ) : fill > 0 ? (
                        <>
                          <View
                            style={[styles.progressActive, { flex: fill }]}
                          />
                          <View style={{ flex: 1 - fill }} />
                        </>
                      ) : null}
                    </View>
                  );
                })}
              </View>
              <View style={styles.headerRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                  onPress={onClose}
                  hitSlop={10}
                >
                  <Icon name="x" size={26} color={color.white} />
                </Pressable>
                {phase === 'recording' ? (
                  <View style={styles.recPill}>
                    <View style={styles.recDot} />
                    <Text style={styles.recPillText}>{formatMs(elapsedMs)}</Text>
                  </View>
                ) : (
                  <View style={styles.clipPill}>
                    <Text style={styles.clipPillText}>
                      {activeClip?.label ?? 'Clip'} · {clipNumber} of {plan.length}
                    </Text>
                  </View>
                )}
                <View style={styles.headerSpacer} />
              </View>
            </View>

            {showPrompt && activeClip !== null ? (
              <View style={[styles.promptSlot, { top: insets.top + 56 }]}>
                {activeClip.scripted ? (
                  <TeleprompterOverlay
                    key={`${activeIndex}-${takeCount}`}
                    text={activeClip.script}
                    speed={speed}
                    running={phase === 'recording'}
                  />
                ) : (
                  <View style={styles.talkingPoint}>
                    <Text style={styles.talkingLabel}>Talk about</Text>
                    <Text style={styles.talkingHint}>
                      Say it your way. Not shown on the video
                    </Text>
                    <View style={styles.talkingBox}>
                      <Text style={styles.talkingText}>{activeClip.script}</Text>
                    </View>
                  </View>
                )}
              </View>
            ) : null}

            {capturePhase && phase !== 'between' && activeClip !== null ? (
              <CameraRail
                style={{ top: insets.top + 56 }}
                facing={facing}
                onFlip={flipCamera}
                flashOn={flashOn}
                onToggleFlash={() => setFlashOn((v) => !v)}
                zoom={zoom}
                hasUltraWide={lenses.hasUltraWide}
                onToggleZoom={toggleZoom}
                speed={speed}
                onCycleSpeed={cycleSpeed}
                showSpeed={activeClip.scripted}
                recording={phase === 'recording'}
              />
            ) : null}

            {phase === 'countdown' ? (
              <Pressable
                style={styles.countdownWrap}
                onPress={() => setPhase('idle')}
              >
                <Text style={styles.countdown}>{countdown}</Text>
              </Pressable>
            ) : null}

            {phase === 'between' && activeClip !== null ? (
              <View style={styles.betweenScrim}>
                <View
                  style={[
                    styles.betweenPanel,
                    { paddingBottom: Math.max(insets.bottom, 14) + 6 },
                  ]}
                >
                  <View style={styles.betweenTop}>
                    <View style={styles.betweenThumb}>
                      {pendingThumb !== null ? (
                        <Image
                          source={{ uri: pendingThumb }}
                          style={StyleSheet.absoluteFill}
                          resizeMode="cover"
                        />
                      ) : null}
                      <View style={styles.betweenThumbGlyph}>
                        <Icon name="play" size={12} color={color.white} />
                      </View>
                    </View>
                    <View style={styles.betweenText}>
                      <Text style={styles.betweenTitle}>
                        {pendingSaved
                          ? `Clip ${clipNumber} saved · ${formatMs(pendingDurationMs)}`
                          : `Saving clip ${clipNumber}…`}
                      </Text>
                      <Text style={styles.betweenSub}>
                        {toGo > 0
                          ? `${toGo} ${toGo === 1 ? 'clip' : 'clips'} to go.`
                          : 'That was the last one.'}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.betweenDots}>
                    {plan.map((c, i) => (
                      <View
                        key={c.slotIndex}
                        style={[
                          styles.betweenDot,
                          kept[c.slotIndex] !== undefined &&
                            styles.betweenDotDone,
                          i === activeIndex && styles.betweenDotActive,
                        ]}
                      />
                    ))}
                  </View>
                  <View style={styles.betweenActions}>
                    <PressableScale
                      accessibilityRole="button"
                      accessibilityLabel="Redo this clip"
                      onPress={redoClip}
                      style={styles.redoBtn}
                    >
                      <Text style={styles.redoText}>Redo clip</Text>
                    </PressableScale>
                    <PressableScale
                      accessibilityRole="button"
                      accessibilityLabel={toGo > 0 ? 'Next clip' : 'Process post'}
                      onPress={() => {
                        if (!pendingSaved) return;
                        if (toGo > 0) nextClip();
                        else void processPost();
                      }}
                      style={[
                        styles.nextBtn,
                        !pendingSaved && styles.nextBtnOff,
                      ]}
                    >
                      <Text style={styles.nextText}>
                        {toGo > 0 ? 'Next clip' : 'Process post'}
                      </Text>
                    </PressableScale>
                  </View>
                </View>
              </View>
            ) : null}
          </View>

          {phase !== 'between' ? (
            <View
              style={[
                styles.bottomBar,
                { paddingBottom: Math.max(insets.bottom, 14) },
              ]}
            >
              <View style={styles.shutterRow}>
                <View style={styles.shutterSide}>
                  {phase !== 'recording' && keptCount > 0 ? (
                    <PressableScale
                      accessibilityRole="button"
                      accessibilityLabel={`Finish with ${keptCount} clips`}
                      onPress={() => void processPost()}
                      style={styles.finishPill}
                    >
                      <Text style={styles.finishText}>
                        Finish with {keptCount}
                      </Text>
                    </PressableScale>
                  ) : null}
                </View>
                {phase === 'recording' ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Stop recording"
                    onPress={stopClip}
                    style={[styles.shutter, styles.shutterRecording]}
                  >
                    <View style={styles.stopSquare} />
                  </Pressable>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Start recording"
                    style={[styles.shutter, !cameraReady && styles.shutterOff]}
                    disabled={!cameraReady || phase === 'countdown'}
                    onPress={onShutterPress}
                  >
                    <View style={styles.shutterInner} />
                  </Pressable>
                )}
                <View style={styles.shutterSide}>
                  <Text style={styles.clipsLeft}>
                    {phase === 'recording'
                      ? 'Tap to stop'
                      : `${clipsLeft} ${clipsLeft === 1 ? 'clip' : 'clips'} left`}
                  </Text>
                </View>
              </View>
            </View>
          ) : null}
        </>
      )}

      <SheetShell visible={sendOpen} onClose={() => setSendOpen(false)}>
        <Text style={styles.reviewLabel}>Autofilled from the brief</Text>
        <Text style={styles.reviewTitle} numberOfLines={2}>
          {reviewData?.title ?? task?.title ?? ''}
        </Text>
        <View style={styles.reviewChips}>
          {reviewData !== null ? <FormatTag format={reviewData.format} /> : null}
          {typeMeta !== null ? (
            <TypeTag label={typeMeta.label} typeKey={typeMeta.key} />
          ) : null}
        </View>
        {reviewData?.caption ? (
          <View style={styles.captionBlock}>
            <Text style={styles.captionLabel}>Caption</Text>
            <Text style={styles.captionText}>{reviewData.caption}</Text>
          </View>
        ) : null}
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Send for approval"
          onPress={() => void sendEdited()}
          style={styles.sendBtn}
        >
          <Icon name="send" size={19} color={color.white} />
          <Text style={styles.sendText}>Send for approval</Text>
        </PressableScale>
      </SheetShell>

      <SoftToast
        visible={errorToast !== null}
        message={errorToast ?? ''}
        tone="error"
        onHide={() => setErrorToast(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.ink900 },
  fallbackSkeleton: {
    flex: 1,
    width: '100%',
    opacity: 0.12,
  },
  fallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.ink900,
    paddingHorizontal: space[10],
  },
  fallbackText: {
    color: color.whiteA75,
    fontSize: type.size.body,
    textAlign: 'center',
  },
  stage: {
    flex: 1,
    width: '100%',
    overflow: 'hidden',
    backgroundColor: color.ink800,
  },
  permissionGate: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space[10],
    backgroundColor: color.ink800,
    gap: space[4],
    zIndex: 5,
  },
  permissionTitle: {
    color: color.white,
    fontSize: type.size.titleSm,
    fontWeight: type.weight.heavy,
    textAlign: 'center',
  },
  permissionBody: {
    color: color.whiteA75,
    fontSize: type.size.body,
    textAlign: 'center',
    lineHeight: type.size.body * 1.4,
  },
  permissionBtn: {
    marginTop: space[4],
    backgroundColor: color.white,
    borderRadius: radius.lg,
    paddingHorizontal: space[8],
    paddingVertical: space[5],
  },
  permissionBtnText: {
    color: color.ink900,
    fontSize: type.size.body,
    fontWeight: type.weight.heavy,
  },
  frontGlow: {
    ...StyleSheet.absoluteFill,
    backgroundColor: color.whiteA45,
  },
  greenScreenLayer: {
    ...StyleSheet.absoluteFill,
    opacity: 0.62,
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: space[5],
    gap: 10,
    zIndex: 4,
  },
  progressRow: {
    flexDirection: 'row',
    gap: 3,
  },
  progressTrack: {
    flex: 1,
    height: 3,
    borderRadius: radius.pill,
    backgroundColor: color.whiteA28,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  progressDone: {
    flex: 1,
    backgroundColor: color.white,
  },
  progressActive: {
    backgroundColor: color.accent,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerSpacer: {
    width: 26,
  },
  clipPill: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: color.inkA55,
  },
  clipPillText: {
    color: color.white,
    fontSize: type.size.label,
    fontWeight: type.weight.bold,
  },
  recPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: color.inkA55,
  },
  recDot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: color.danger,
  },
  recPillText: {
    color: color.white,
    fontSize: type.size.label,
    fontWeight: type.weight.heavy,
    fontVariant: ['tabular-nums'],
  },
  promptSlot: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 3,
    paddingTop: 40,
    paddingHorizontal: 60,
  },
  talkingPoint: {
    alignItems: 'center',
    gap: 4,
  },
  talkingBox: {
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.42)',
  },
  talkingLabel: {
    fontSize: type.size.micro,
    fontWeight: type.weight.heavy,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: color.whiteA60,
  },
  talkingHint: {
    fontSize: type.size.micro11,
    fontWeight: type.weight.semibold,
    color: color.whiteA45,
  },
  talkingText: {
    fontSize: 21,
    lineHeight: 21 * 1.35,
    fontWeight: type.weight.bold,
    color: color.white,
    textAlign: 'center',
  },
  countdownWrap: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.scrim,
    zIndex: 6,
  },
  countdown: {
    color: color.white,
    fontSize: 96,
    fontWeight: type.weight.heavy,
  },
  betweenScrim: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'flex-end',
    backgroundColor: color.scrim,
    zIndex: 7,
  },
  betweenPanel: {
    paddingHorizontal: space[7],
    paddingTop: space[6],
    gap: 14,
    backgroundColor: color.scrimStrong,
  },
  betweenTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  betweenThumb: {
    width: 46,
    height: 62,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: color.white,
    backgroundColor: color.ink800,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  betweenThumbGlyph: {
    position: 'absolute',
    alignSelf: 'center',
  },
  betweenText: {
    flex: 1,
    gap: 2,
  },
  betweenTitle: {
    color: color.white,
    fontSize: type.size.bodySm,
    fontWeight: type.weight.heavy,
  },
  betweenSub: {
    color: color.whiteA75,
    fontSize: type.size.chip,
  },
  betweenDots: {
    flexDirection: 'row',
    gap: 6,
  },
  betweenDot: {
    width: 6,
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: color.whiteA28,
  },
  betweenDotDone: {
    backgroundColor: color.white,
  },
  betweenDotActive: {
    backgroundColor: color.accent,
  },
  betweenActions: {
    flexDirection: 'row',
    gap: 10,
  },
  redoBtn: {
    flex: 1,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: color.whiteA16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  redoText: {
    color: color.white,
    fontSize: type.size.bodySm,
    fontWeight: type.weight.bold,
  },
  nextBtn: {
    flex: 1,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: color.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextBtnOff: {
    opacity: 0.5,
  },
  nextText: {
    color: color.white,
    fontSize: type.size.bodySm,
    fontWeight: type.weight.heavy,
  },
  bottomBar: {
    backgroundColor: color.ink900,
    paddingHorizontal: space[7],
    paddingTop: space[4],
    gap: 14,
  },
  shutterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  shutterSide: {
    flex: 1,
    alignItems: 'center',
  },
  finishPill: {
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: color.whiteA16,
  },
  finishText: {
    color: color.white,
    fontSize: type.size.chip,
    fontWeight: type.weight.bold,
  },
  clipsLeft: {
    color: color.whiteA75,
    fontSize: type.size.chip,
    fontWeight: type.weight.semibold,
  },
  shutter: {
    width: 84,
    height: 84,
    borderRadius: radius.pill,
    borderWidth: 5,
    borderColor: 'rgba(255,255,255,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterRecording: {
    borderColor: 'rgba(255,255,255,0.9)',
  },
  shutterOff: {
    opacity: 0.4,
  },
  shutterInner: {
    width: 66,
    height: 66,
    borderRadius: radius.pill,
    backgroundColor: color.danger,
  },
  stopSquare: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: color.danger,
  },
  processing: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingHorizontal: space[10],
    backgroundColor: color.ink900,
  },
  spinnerRing: {
    width: 54,
    height: 54,
    borderRadius: radius.pill,
    borderWidth: 4,
    borderColor: color.whiteA28,
    borderTopColor: color.accent,
  },
  processingTitle: {
    color: color.white,
    fontSize: type.size.card,
    fontWeight: type.weight.heavy,
    textAlign: 'center',
  },
  processingSub: {
    color: color.whiteA75,
    fontSize: type.size.bodySm,
    lineHeight: type.size.bodySm * type.leading.body,
    textAlign: 'center',
  },
  review: {
    flex: 1,
    backgroundColor: color.ink900,
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space[7],
    paddingVertical: space[2],
  },
  reviewHeaderBtn: {
    color: color.white,
    fontSize: type.size.bodySm,
    fontWeight: type.weight.bold,
    width: 60,
  },
  reviewHeaderTitle: {
    color: color.white,
    fontSize: type.size.body,
    fontWeight: type.weight.heavy,
  },
  reviewHeaderSpacer: {
    width: 60,
  },
  reviewStage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: space[3],
  },
  reviewCard: {
    height: '100%',
    aspectRatio: 9 / 16,
    maxWidth: '86%',
    borderRadius: radius.xl,
    backgroundColor: color.ink800,
    overflow: 'hidden',
  },
  reviewSegments: {
    position: 'absolute',
    top: 10,
    left: 10,
    right: 10,
    flexDirection: 'row',
    gap: 3,
    zIndex: 2,
  },
  reviewSegment: {
    flex: 1,
    height: 3,
    borderRadius: radius.pill,
    backgroundColor: color.whiteA28,
  },
  reviewSegmentOn: {
    backgroundColor: color.white,
  },
  reviewClipLabel: {
    position: 'absolute',
    top: 22,
    alignSelf: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  reviewClipLabelText: {
    color: color.white,
    fontSize: type.size.micro,
    fontWeight: type.weight.bold,
  },
  reviewArrow: {
    position: 'absolute',
    top: '50%',
    marginTop: -17,
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.whiteA16,
  },
  reviewArrowLeft: {
    left: 10,
  },
  reviewArrowRight: {
    right: 10,
  },
  placeHint: {
    position: 'absolute',
    bottom: 16,
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  placeHintText: {
    color: color.white,
    fontSize: type.size.micro,
    fontWeight: type.weight.bold,
  },
  reviewPlayWrap: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewPlay: {
    width: 58,
    height: 58,
    borderRadius: radius.pill,
    backgroundColor: color.whiteA92,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewSheet: {
    backgroundColor: color.white,
    borderTopLeftRadius: radius['2xl'],
    borderTopRightRadius: radius['2xl'],
    paddingHorizontal: space.gutter,
    paddingTop: space[6],
    gap: 10,
  },
  reviewLabel: {
    fontSize: type.size.micro,
    fontWeight: type.weight.heavy,
    letterSpacing: type.tracking.label,
    textTransform: 'uppercase',
    color: color.slate400,
  },
  reviewTitle: {
    fontSize: 19,
    lineHeight: 19 * 1.25,
    fontWeight: type.weight.bold,
    letterSpacing: -0.3,
    color: color.ink,
  },
  reviewChips: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  captionBlock: {
    gap: 4,
  },
  captionScroll: {
    maxHeight: 132,
  },
  captionLabel: {
    fontSize: type.size.micro,
    fontWeight: type.weight.heavy,
    letterSpacing: type.tracking.label,
    textTransform: 'uppercase',
    color: color.slate400,
  },
  captionText: {
    fontSize: type.size.meta,
    lineHeight: type.size.meta * type.leading.body,
    color: color.slate500,
  },
  sendBtn: {
    marginTop: 4,
    height: 60,
    borderRadius: radius.pill,
    backgroundColor: color.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  sendBtnOff: {
    opacity: 0.7,
  },
  sendText: {
    color: color.white,
    fontSize: type.size.action,
    fontWeight: type.weight.heavy,
  },
});
