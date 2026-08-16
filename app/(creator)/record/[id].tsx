import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Image,
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
  SegmentOverlayPreview,
  type ShotPreview,
} from '../../../components/creator/SegmentOverlayPreview';
import { TeleprompterOverlay } from '../../../components/creator/TeleprompterOverlay';
import { useCreatorToast } from '../../../components/creator/Toast';
import { parseChangesNote } from '../../../components/ReviewThread';
import { SoftToast } from '../../../components/states';
import { Icon } from '../../../components/ui/Icon';
import { PressableScale } from '../../../components/ui/PressableScale';
import { color, motion, radius, space, type } from '../../../theme/tokens';
import { useAuth } from '../../../lib/auth';
import {
  listBriefSegments,
  parseHookOptions,
  parseTalkingPoints,
  parseTextOverlay,
  signedScreenshotUrl,
  type BriefSegment,
} from '../../../lib/briefs-api';
import { useCreatorQueue } from '../../../lib/creator-queue';
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
  loadDraftSegments,
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

const COUNTDOWN_STEP_MS = 800;
const SPEEDS = [0.75, 1, 1.25, 1.5] as const;
const MAX_CLIP_MS = 90_000;
/** The visual fill reference: the current segment fills by elapsed / 20s. */
const PROGRESS_REF_MS = 20_000;
const PROCESSING_MIN_MS = 2_000;
const STOP_WATCHDOG_MS = 5_000;
const RECORD_ARM_MS = 350;
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
  const pointTexts = talkingPoints
    .map((p) => p.text?.trim() ?? '')
    .filter((t) => t.length > 0);
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
      const text =
        talkingPoints[pointIndex]?.text?.trim() ||
        s.overlay_text?.trim() ||
        '';
      return {
        slotIndex: s.slot_index,
        kind: 'point' as const,
        label: `Point ${pointNumber}`,
        chip: String(pointNumber),
        script: text,
        scripted: false,
      };
    });
  }

  if (pointTexts.length > 0) {
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
    pointTexts.forEach((text, i) => {
      plan.push({
        slotIndex: plan.length,
        kind: 'point',
        label: `Point ${i + 1}`,
        chip: String(i + 1),
        script: text,
        scripted: false,
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
  const [kept, setKept] = useState<Record<number, KeptClip>>({});
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [, setPendingClip] = useState<PendingClip | null>(null);
  const [pendingSaved, setPendingSaved] = useState(false);
  const [pendingThumb, setPendingThumb] = useState<string | null>(null);
  const [pendingDurationMs, setPendingDurationMs] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [takeCount, setTakeCount] = useState(0);
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const [stageSize, setStageSize] = useState<{ w: number; h: number } | null>(null);
  const [shots, setShots] = useState<Record<string, ShotPreview>>({});

  // Review player state.
  const [reviewUris, setReviewUris] = useState<string[]>([]);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [reviewPlaying, setReviewPlaying] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [reviewCardSize, setReviewCardSize] = useState<{
    w: number;
    h: number;
  } | null>(null);
  const reviewSheet = useRef(new Animated.Value(0)).current;

  const recordingRef = useRef(false);
  const discardClipRef = useRef(false);
  const recordStartedRef = useRef(false);
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
          if (a && profile) {
            const [segs, draft, events] = await Promise.all([
              listBriefSegments(a.briefs.id),
              loadDraftSegments(profile.company_id, a.id),
              a.status === 'changes_requested'
                ? listAssignmentReviewEvents(a.id)
                : Promise.resolve([]),
            ]);
            if (cancelled) return;
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
        let url = await signedScreenshotUrl(path);
        if (/\.(mp4|mov|m4v|webm)(\?|#|$)/i.test(path)) {
          try {
            const t = await VideoThumbnails.getThumbnailAsync(url, { time: 0 });
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
        return [s.id, { url, aspect }] as const;
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
    if (phase !== 'recording') return;
    if (elapsedMs > MAX_CLIP_MS + 5000) stopClip();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, elapsedMs]);

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

  useEffect(() => {
    setCameraReady(false);
  }, [facing]);

  useEffect(() => {
    if (!cameraMounted) setCameraReady(false);
  }, [cameraMounted]);

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
      const clip = await cam.recordAsync({
        maxDuration: Math.ceil(MAX_CLIP_MS / 1000),
      });
      if (discardClipRef.current) {
        discardClipRef.current = false;
        setPhase('idle');
      } else if (clip?.uri) {
        const captured: PendingClip = {
          uri: clip.uri,
          durationMs: Math.max(500, Date.now() - startedAt),
        };
        setPendingClip(captured);
        setPendingSaved(false);
        setPendingThumb(null);
        setPendingDurationMs(captured.durationMs);
        setPhase('between');
        void VideoThumbnails.getThumbnailAsync(clip.uri, { time: 0 })
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
    const next = plan.findIndex((c) => kept[c.slotIndex] === undefined);
    if (next !== -1) setActiveIndex(next);
    setPhase('idle');
  }

  async function processPost() {
    setPendingClip(null);
    setPhase('processing');
    const startedAt = Date.now();
    try {
      const clips = plan
        .filter((c) => kept[c.slotIndex] !== undefined)
        .map((c) => kept[c.slotIndex]);
      const uris = await Promise.all(
        clips.map(async (k) => {
          if (k.localUri !== null) return k.localUri;
          if (k.storagePath !== null) return signedVideoUrl(k.storagePath);
          throw new Error('A clip is missing. Record it again.');
        }),
      );
      const waitLeft = PROCESSING_MIN_MS - (Date.now() - startedAt);
      if (waitLeft > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, waitLeft));
      }
      setReviewUris(uris);
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

  async function sendForApproval() {
    if (!profile || submitting) return;
    setSubmitting(true);
    try {
      if (assignment) {
        const clips = plan
          .filter((c) => kept[c.slotIndex] !== undefined)
          .map((c) => {
            const k = kept[c.slotIndex];
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
          clips,
        });
        try {
          await clearDraft(profile.company_id, assignment.id);
        } catch {
          // submission is in; stale draft is harmless
        }
        queue.applyLocal(updated);
      } else if (task) {
        const segments = plan
          .filter((c) => kept[c.slotIndex] !== undefined)
          .map((c) => {
            const k = kept[c.slotIndex];
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
        <ActivityIndicator size="large" color={color.accent} />
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
  const prompterDurationMs = Math.round(PROGRESS_REF_MS / speed);
  const submitCount = keptCount;
  const clipNumber = (activeIndex ?? 0) + 1;
  const toGo = plan.filter(
    (c) =>
      kept[c.slotIndex] === undefined &&
      c.slotIndex !== (activeClip?.slotIndex ?? -1),
  ).length;

  // Green screen: live camera ghosts over the screenshot background so the
  // creator stands where the final cutout lands.
  const ghostStyle = greenScreenActive
    ? [StyleSheet.absoluteFill, { opacity: 0.68 }]
    : StyleSheet.absoluteFill;

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
                />
              ) : null}
              <View style={styles.reviewSegments}>
                {reviewUris.map((uri, i) => (
                  <View
                    key={uri}
                    style={[
                      styles.reviewSegment,
                      i <= reviewIndex && reviewPlaying
                        ? styles.reviewSegmentOn
                        : i < reviewIndex
                          ? styles.reviewSegmentOn
                          : null,
                    ]}
                  />
                ))}
              </View>
              {!reviewPlaying ? (
                <View style={styles.reviewPlayWrap} pointerEvents="none">
                  <View style={styles.reviewPlay}>
                    <Icon name="play" size={24} color={color.ink} />
                  </View>
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
            {greenScreenActive && activeShot ? (
              <Image
                source={{ uri: activeShot.url }}
                style={StyleSheet.absoluteFill}
                resizeMode="cover"
              />
            ) : null}

            {cameraMounted ? (
              <View style={ghostStyle}>
                <CameraView
                  key={facing}
                  ref={cameraRef}
                  style={StyleSheet.absoluteFill}
                  facing={facing}
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
                  <Text style={styles.closeText}>Close</Text>
                </Pressable>
                <View style={styles.clipPill}>
                  <Text style={styles.clipPillText}>
                    Clip {clipNumber} of {plan.length}
                  </Text>
                </View>
              </View>
            </View>

            {showPrompt && activeClip !== null ? (
              <View style={[styles.promptSlot, { top: insets.top + 46 }]}>
                {activeClip.scripted ? (
                  <TeleprompterOverlay
                    key={`${activeIndex}-${takeCount}-${speed}`}
                    text={activeClip.script}
                    durationMs={prompterDurationMs}
                  />
                ) : (
                  <View style={styles.talkingPoint}>
                    <Text style={styles.talkingLabel}>Talking point</Text>
                    <Text style={styles.talkingHint}>
                      (Say it your way, this won&apos;t show on the video)
                    </Text>
                    <Text style={styles.talkingText}>{activeClip.script}</Text>
                  </View>
                )}
              </View>
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
              {phase === 'recording' ? (
                <View style={styles.recordingRow}>
                  <Text style={styles.elapsed}>{formatMs(elapsedMs)}</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Stop recording"
                    onPress={stopClip}
                    style={styles.stopBtn}
                  >
                    <View style={styles.stopSquare} />
                  </Pressable>
                  <Text style={styles.stopHint}>Stop saves this clip</Text>
                </View>
              ) : (
                <>
                  <View style={styles.controlsRow}>
                    <PressableScale
                      accessibilityRole="button"
                      accessibilityLabel="Switch camera"
                      onPress={() =>
                        setFacing((f) => (f === 'front' ? 'back' : 'front'))
                      }
                      style={styles.roundCtl}
                    >
                      <Icon name="switch-camera" size={20} color={color.white} />
                    </PressableScale>
                    <View style={styles.speedRow}>
                      {SPEEDS.map((s) => (
                        <Pressable
                          key={s}
                          accessibilityRole="button"
                          accessibilityLabel={`Teleprompter speed ${s}x`}
                          onPress={() => setSpeed(s)}
                          style={[styles.speedChip, speed === s && styles.speedOn]}
                        >
                          <Text style={styles.speedText}>{s}x</Text>
                        </Pressable>
                      ))}
                    </View>
                    <PressableScale
                      accessibilityRole="button"
                      accessibilityLabel={flashOn ? 'Flash on' : 'Flash off'}
                      onPress={() => setFlashOn((v) => !v)}
                      style={[styles.roundCtl, flashOn && styles.roundCtlOn]}
                    >
                      <Icon
                        name="zap"
                        size={18}
                        color={flashOn ? color.ink900 : color.white}
                      />
                    </PressableScale>
                  </View>

                  <View style={styles.shutterRow}>
                    <View style={styles.shutterSide}>
                      {keptCount > 0 ? (
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
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Start recording"
                      style={[styles.shutter, !cameraReady && styles.shutterOff]}
                      disabled={!cameraReady || phase === 'countdown'}
                      onPress={onShutterPress}
                    >
                      <View style={styles.shutterInner} />
                    </Pressable>
                    <View style={styles.shutterSide}>
                      <Text style={styles.clipsLeft}>
                        {clipsLeft} {clipsLeft === 1 ? 'clip' : 'clips'} left
                      </Text>
                    </View>
                  </View>
                </>
              )}
            </View>
          ) : null}
        </>
      )}

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
    ...StyleSheet.absoluteFillObject,
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
    ...StyleSheet.absoluteFillObject,
    backgroundColor: color.whiteA45,
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
  closeText: {
    color: color.white,
    fontSize: type.size.body,
    fontWeight: type.weight.bold,
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
  promptSlot: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 3,
    paddingTop: 40,
  },
  talkingPoint: {
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 26,
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
    marginTop: 8,
    fontSize: 24,
    lineHeight: 24 * 1.35,
    fontWeight: type.weight.bold,
    color: color.white,
    textAlign: 'center',
  },
  countdownWrap: {
    ...StyleSheet.absoluteFillObject,
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
    ...StyleSheet.absoluteFillObject,
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
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  roundCtl: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: color.whiteA16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundCtlOn: {
    backgroundColor: color.white,
  },
  speedRow: {
    flexDirection: 'row',
    gap: 8,
  },
  speedChip: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: color.whiteA16,
  },
  speedOn: {
    backgroundColor: color.accent,
  },
  speedText: {
    color: color.white,
    fontSize: type.size.chip,
    fontWeight: type.weight.bold,
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
    borderWidth: 4,
    borderColor: color.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterOff: {
    opacity: 0.4,
  },
  shutterInner: {
    width: 68,
    height: 68,
    borderRadius: radius.pill,
    backgroundColor: color.white,
  },
  recordingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  elapsed: {
    flex: 1,
    color: color.white,
    fontSize: 18,
    fontWeight: type.weight.heavy,
  },
  stopBtn: {
    width: 76,
    height: 76,
    borderRadius: radius.pill,
    borderWidth: 4,
    borderColor: color.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopSquare: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: color.accent,
  },
  stopHint: {
    flex: 1,
    textAlign: 'right',
    color: color.whiteA75,
    fontSize: type.size.chip,
    fontWeight: type.weight.semibold,
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
  reviewPlayWrap: {
    ...StyleSheet.absoluteFillObject,
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
