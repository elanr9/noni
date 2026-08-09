import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  Pressable,
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
import * as WebBrowser from 'expo-web-browser';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BeatPrompter, Teleprompter } from '../../../components/Teleprompter';
import { parseChangesNote } from '../../../components/ReviewThread';
import { KeepClipConfirm, SoftToast } from '../../../components/states';
import { Icon } from '../../../components/ui/Icon';
import { color, radius, shadow, space, type } from '../../../theme/tokens';
import { useAuth } from '../../../lib/auth';
import {
  listBriefSegments,
  parseHookOptions,
  parseTalkingPoints,
  parseTextOverlay,
  signedScreenshotUrl,
  type BriefSegment,
} from '../../../lib/briefs-api';
import {
  SegmentOverlayPreview,
  type ShotPreview,
} from '../../../components/creator/SegmentOverlayPreview';
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
import type { ContentTask } from '../../../lib/tasks';
import { flaggedSlotIndices } from './flagged';

type Phase =
  | 'idle'
  | 'countdown'
  | 'recording'
  | 'clipReview'
  | 'saving'
  | 'submitting'
  | 'sent';

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
const TOAST_MS = 2600;
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5] as const;
const MAX_CLIP_MS = 90_000;
const STOP_WATCHDOG_MS = 5_000;
const RECORD_ARM_MS = 350;
const SHUTTER_SIZE = 84;
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

function estimateRuntimeSec(clip: ClipPlan): number {
  if (clip.kind === 'hook') return 6;
  if (clip.kind === 'outro') return 5;
  const words = clip.script.split(/\s+/).filter(Boolean).length;
  return Math.max(4, Math.min(45, Math.round(words * 0.4)));
}

function clipKindLabel(clip: ClipPlan): string {
  if (clip.kind === 'hook') return 'hook';
  if (clip.kind === 'outro') return 'cta';
  return clip.label.toLowerCase();
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
  const cameraRef = useRef<CameraView>(null);
  const pulse = useRef(new Animated.Value(1)).current;

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
  const [pendingClip, setPendingClip] = useState<PendingClip | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [scriptPaused, setScriptPaused] = useState(false);
  const [takeCount, setTakeCount] = useState(0);
  const [keepConfirm, setKeepConfirm] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [stageSize, setStageSize] = useState<{ w: number; h: number } | null>(null);
  const [shots, setShots] = useState<Record<string, ShotPreview>>({});

  const recordingRef = useRef(false);
  const discardClipRef = useRef(false);
  const recordStartedRef = useRef(false);
  const stopWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevBrightnessRef = useRef<number | null>(null);

  const brief = isAssignment ? assignment?.briefs ?? null : null;
  const title = (isAssignment ? brief?.title : task?.title) ?? '';
  const exampleUrl = brief?.example_url ?? null;

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
  const allKept =
    plan.length > 0 && plan.every((c) => kept[c.slotIndex] !== undefined);
  const replacing =
    activeClip !== null && kept[activeClip.slotIndex] !== undefined;

  const pendingSource = phase === 'clipReview' ? (pendingClip?.uri ?? null) : null;
  const player = useVideoPlayer(pendingSource, (p) => {
    p.loop = true;
    if (pendingSource) p.play();
  });

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
    setActiveIndex(first === -1 ? null : first);
    setInitialized(true);
  }, [loading, initialized, plan, kept]);

  // Sign the brief's screenshots so the live preview can show them exactly
  // where the final edit will place them.
  useEffect(() => {
    const withShots = briefSegments.filter((s) => s.screenshot_url);
    if (withShots.length === 0) return;
    let cancelled = false;
    void Promise.all(
      withShots.map(async (s) => {
        const url = await signedScreenshotUrl(s.screenshot_url as string);
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
    if (phase !== 'recording') {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.35,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [phase, pulse]);

  useEffect(() => {
    return () => {
      void restoreBrightness();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Keep CameraView mounted across idle → record → review so the session
  // stays warm. Unmounting for review was a common black-preview cause.
  const cameraMounted =
    permissionsGranted &&
    activeClip !== null &&
    phase !== 'submitting' &&
    phase !== 'sent';

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
    setScriptPaused(false);
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
        setPendingClip({
          uri: clip.uri,
          durationMs: Math.max(500, Date.now() - startedAt),
        });
        setPhase('clipReview');
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

  function retakePending() {
    setPendingClip(null);
    setPhase('idle');
  }

  async function keepPendingClip() {
    if (!pendingClip || !profile || activeClip === null) return;
    setPhase('saving');
    try {
      const durationMs = await probeDurationMs(
        pendingClip.uri,
        pendingClip.durationMs,
      );
      let storagePath: string | null = null;
      if (assignment) {
        storagePath = draftClipPath(
          profile.company_id,
          assignment.id,
          activeClip.slotIndex,
        );
        await uploadClip(pendingClip.uri, storagePath);
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
      const nextKept: Record<number, KeptClip> = {
        ...kept,
        [activeClip.slotIndex]: {
          slotIndex: activeClip.slotIndex,
          kind: activeClip.kind,
          durationMs,
          storagePath,
          localUri: pendingClip.uri,
        },
      };
      setKept(nextKept);
      setPendingClip(null);
      const next = plan.findIndex((c) => nextKept[c.slotIndex] === undefined);
      setActiveIndex(next === -1 ? null : next);
      setPhase('idle');
      setKeepConfirm(true);
    } catch (e) {
      setPhase('clipReview');
      setToast(
        e instanceof Error
          ? e.message
          : 'Could not save the clip. Check your connection and try again.',
      );
    }
  }

  function jumpToClip(index: number) {
    if (phase !== 'idle' && phase !== 'clipReview') return;
    if (phase === 'clipReview') retakePending();
    setPendingClip(null);
    setActiveIndex(index);
  }

  async function sendForReview() {
    if (!profile || !allKept) return;
    setPhase('submitting');
    try {
      if (assignment) {
        const clips = plan.map((c) => {
          const k = kept[c.slotIndex];
          if (k === undefined || k.storagePath === null) {
            throw new Error('A clip is missing. Record it again.');
          }
          return {
            slotIndex: k.slotIndex,
            storagePath: k.storagePath,
            durationMs: k.durationMs,
          };
        });
        await submitAssignmentClips({
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
      } else if (task) {
        const segments = plan.map((c) => {
          const k = kept[c.slotIndex];
          if (k === undefined || k.localUri === null) {
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
      setPhase('sent');
      setTimeout(() => router.replace('/(creator)/(tabs)'), TOAST_MS);
    } catch (e) {
      setPhase('idle');
      setToast(e instanceof Error ? e.message : 'Upload failed. Try again.');
    }
  }

  function onClose() {
    if (phase === 'sent' || phase === 'saving' || phase === 'submitting') return;
    if (phase === 'clipReview') {
      retakePending();
      return;
    }
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

  function onWatchExample() {
    if (!exampleUrl) {
      Alert.alert(
        'No example yet',
        'Your team has not attached an example for this post.',
      );
      return;
    }
    void WebBrowser.openBrowserAsync(exampleUrl);
  }

  function onShutterPress() {
    if (phase === 'idle') void beginCountdown();
    else if (phase === 'recording') stopClip();
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

  const showCamera = cameraMounted;
  const frontGlow = phase === 'recording' && flashOn && facing === 'front';
  const summaryMode = activeIndex === null && phase === 'idle';
  const canRetake = phase === 'clipReview';
  const canKeep = phase === 'clipReview';
  const shutterRecording = phase === 'recording';
  const needsPermissionGate =
    activeClip !== null &&
    !summaryMode &&
    phase !== 'clipReview' &&
    !permissionsGranted;
  const showLiveChrome =
    !summaryMode && phase !== 'clipReview' && phase !== 'saving';

  // Green screen, TikTok style: the screenshot is the background and the
  // creator gets cut out over it in the final edit. Live we cannot cut the
  // background out, so the camera shows ghosted over the image; where you
  // stand in frame is exactly where you land in the final video.
  const ghostStyle = greenScreenActive
    ? [StyleSheet.absoluteFill, { opacity: 0.68 }]
    : StyleSheet.absoluteFill;

  return (
    <View style={styles.root}>
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

        {showCamera ? (
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

        {phase === 'clipReview' && pendingSource ? (
          <View style={ghostStyle}>
            <VideoView
              style={StyleSheet.absoluteFill}
              player={player}
              contentFit="cover"
              nativeControls={false}
            />
          </View>
        ) : null}

        {summaryMode ? (
          <View style={styles.summaryFill}>
            <Text style={styles.summaryTitle}>All clips recorded</Text>
            <Text style={styles.summaryText}>
              Your clips post as one video. Tap a segment above to record it
              again, or send everything for review.
            </Text>
          </View>
        ) : null}

        {frontGlow ? <View style={styles.frontGlow} pointerEvents="none" /> : null}

        {activeSegment &&
        stageSize &&
        (showLiveChrome || phase === 'clipReview') ? (
          <SegmentOverlayPreview
            segment={activeSegment}
            shot={activeShot}
            stageWidth={stageSize.w}
            stageHeight={stageSize.h}
            overlay={parseTextOverlay(brief?.text_overlay)}
          />
        ) : null}

        <View style={[styles.topBar, { paddingTop: insets.top + space[2] }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={onClose}
            style={styles.roundBtn}
            hitSlop={8}
          >
            <Icon name="x" size={20} color={color.white} />
          </Pressable>

          <View style={styles.clipMeta}>
            <View style={styles.clipMetaRow}>
              <Text style={styles.clipTitle} numberOfLines={1}>
                {activeClip
                  ? `Clip ${(activeIndex ?? 0) + 1} of ${plan.length}, ${clipKindLabel(activeClip)}`
                  : title}
              </Text>
              {phase === 'recording' ? (
                <View style={styles.recBadge}>
                  <Animated.View style={[styles.recDot, { opacity: pulse }]} />
                  <Text style={styles.recTime}>{formatMs(elapsedMs)}</Text>
                </View>
              ) : null}
            </View>
            <View style={styles.stepper}>
              {plan.map((c, i) => {
                const isDone = kept[c.slotIndex] !== undefined;
                const isActive = i === activeIndex;
                return (
                  <Pressable
                    key={c.slotIndex}
                    style={styles.stepTrack}
                    onPress={() => jumpToClip(i)}
                    disabled={phase !== 'idle'}
                  >
                    <View
                      style={[
                        styles.stepFill,
                        isDone && styles.stepDone,
                        isActive && !isDone && styles.stepActive,
                        isActive &&
                          phase === 'recording' && {
                            flex: Math.min(elapsedMs / MAX_CLIP_MS, 1),
                          },
                      ]}
                    />
                  </Pressable>
                );
              })}
            </View>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={flashOn ? 'Flash on' : 'Flash off'}
            onPress={() => {
              if (phase === 'recording') return;
              setFlashOn((v) => !v);
            }}
            style={[styles.roundBtn, flashOn && styles.roundBtnOn]}
            hitSlop={8}
          >
            <Icon
              name="zap"
              size={18}
              color={flashOn ? color.ink900 : color.white}
            />
          </Pressable>
        </View>

        {activeClip && showLiveChrome ? (
          <View style={[styles.exampleRow, { top: insets.top + 64 }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Watch example"
              onPress={onWatchExample}
              style={styles.examplePill}
            >
              <View style={styles.exampleThumb}>
                <Icon name="play" size={13} color={color.white} />
              </View>
              <View>
                <Text style={styles.exampleTitle}>Watch example</Text>
                <Text style={styles.exampleSub}>
                  {activeClip.label}, {estimateRuntimeSec(activeClip)} seconds
                </Text>
              </View>
            </Pressable>
          </View>
        ) : null}

        {showCamera && activeClip && showLiveChrome ? (
          <View style={[styles.prompterSlot, { top: insets.top + 120 }]}>
            {activeClip.scripted ? (
              <Teleprompter
                text={activeClip.script}
                running={phase === 'recording' && !scriptPaused}
                paused={phase === 'recording' && scriptPaused}
                speed={speed}
                resetKey={takeCount}
                onTap={() => {
                  if (phase === 'recording') setScriptPaused((p) => !p);
                }}
              />
            ) : (
              <BeatPrompter
                label="Talking point"
                text={activeClip.script}
                credential={profile?.credential_line ?? null}
              />
            )}
          </View>
        ) : null}

        {phase === 'countdown' ? (
          <Pressable style={styles.countdownWrap} onPress={() => setPhase('idle')}>
            <Text style={styles.countdown}>{countdown}</Text>
            <Text style={styles.countdownHint}>Tap to cancel</Text>
          </Pressable>
        ) : null}
      </View>

      <View
        style={[
          styles.shutterBar,
          { paddingBottom: Math.max(insets.bottom, 14) },
        ]}
      >
        {phase === 'idle' && activeClip?.scripted ? (
          <View style={styles.speedRow}>
            {SPEEDS.map((s) => (
              <Pressable
                key={s}
                onPress={() => setSpeed(s)}
                style={[styles.speedChip, speed === s && styles.speedOn]}
              >
                <Text style={styles.speedText}>{s}x</Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <Text style={styles.modeLabel}>VIDEO</Text>
        )}

        {summaryMode ? (
          <Pressable
            style={styles.submitBtn}
            onPress={() => void sendForReview()}
          >
            <Text style={styles.submitText}>Send for review</Text>
          </Pressable>
        ) : phase === 'submitting' ? (
          <Text style={styles.barHint}>Sending for review…</Text>
        ) : (
          <View style={styles.shutterRow}>
            <Pressable
              style={styles.sideHit}
              onPress={canRetake ? retakePending : undefined}
              disabled={!canRetake}
            >
              {canRetake ? (
                <Text style={styles.sideText}>Retake</Text>
              ) : (
                <View style={styles.sideGhost} />
              )}
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                phase === 'recording' ? 'Stop recording' : 'Start recording'
              }
              style={[
                styles.shutterRing,
                (!cameraReady || phase === 'saving') && styles.shutterOff,
              ]}
              disabled={
                !cameraReady ||
                phase === 'saving' ||
                phase === 'countdown' ||
                phase === 'clipReview'
              }
              onPress={onShutterPress}
            >
              <View
                style={[
                  styles.shutterInner,
                  shutterRecording && styles.shutterInnerStop,
                ]}
              />
            </Pressable>

            {canKeep ? (
              <Pressable
                style={styles.sideHit}
                onPress={() => void keepPendingClip()}
              >
                <Text style={[styles.sideText, styles.sideTextKeep]}>Keep</Text>
              </Pressable>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Switch camera"
                style={styles.flipBtn}
                onPress={() => {
                  if (phase === 'recording') return;
                  setFacing((f) => (f === 'front' ? 'back' : 'front'));
                }}
                disabled={phase === 'recording' || phase === 'countdown'}
              >
                <Icon name="switch-camera" size={22} color={color.white} />
              </Pressable>
            )}
          </View>
        )}

        {phase === 'saving' ? (
          <Text style={styles.barHint}>Saving your clip…</Text>
        ) : null}
        {phase === 'idle' && activeClip && replacing ? (
          <Text style={styles.barHint}>
            This take replaces the clip you already kept.
          </Text>
        ) : null}
        {phase === 'idle' && activeClip && !cameraReady && permissionsGranted ? (
          <Text style={styles.barHint}>Camera starting…</Text>
        ) : null}
      </View>

      <KeepClipConfirm
        visible={keepConfirm}
        onDone={() => setKeepConfirm(false)}
      />

      <SoftToast
        visible={toast !== null}
        message={toast ?? ''}
        tone="error"
        onHide={() => setToast(null)}
      />

      {phase === 'sent' ? (
        <View style={[styles.toast, shadow.shadowFloat]} pointerEvents="none">
          <Text style={styles.toastText}>
            Sent for review. Approve lands it in your queue.
          </Text>
        </View>
      ) : null}
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
    paddingHorizontal: space[7],
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    zIndex: 4,
  },
  roundBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: color.whiteA16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundBtnOn: {
    backgroundColor: color.accent,
  },
  clipMeta: { flex: 1, gap: space[2], paddingTop: 2 },
  clipMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space[2],
  },
  clipTitle: {
    flex: 1,
    color: color.white,
    fontSize: type.size.meta,
    fontWeight: type.weight.heavy,
  },
  recBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: color.scrim,
  },
  recDot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: color.danger,
  },
  recTime: {
    color: color.white,
    fontSize: type.size.chip,
    fontWeight: type.weight.heavy,
  },
  stepper: { flexDirection: 'row', gap: 6 },
  stepTrack: {
    flex: 1,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: color.whiteA28,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  stepFill: { flex: 1, borderRadius: radius.pill },
  stepDone: { backgroundColor: color.blue300 },
  stepActive: { backgroundColor: color.blue300 },
  exampleRow: {
    position: 'absolute',
    right: space[7],
    zIndex: 4,
  },
  examplePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    paddingVertical: 9,
    paddingLeft: 9,
    paddingRight: 14,
    borderRadius: radius.pill,
    backgroundColor: color.scrimStrong,
    borderWidth: 1,
    borderColor: color.whiteA16,
  },
  exampleThumb: {
    width: 26,
    height: 34,
    borderRadius: 6,
    backgroundColor: color.whiteA16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exampleTitle: {
    color: color.white,
    fontSize: type.size.meta,
    fontWeight: type.weight.heavy,
  },
  exampleSub: {
    color: color.whiteA60,
    fontSize: type.size.label,
    marginTop: 1,
  },
  prompterSlot: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 3,
  },
  countdownWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.scrimStrong,
    zIndex: 6,
  },
  countdown: {
    color: color.white,
    fontSize: 96,
    fontWeight: type.weight.heavy,
  },
  countdownHint: {
    color: color.whiteA75,
    fontSize: type.size.bodySm,
    fontWeight: type.weight.bold,
    marginTop: space[2],
  },
  summaryFill: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space[8],
    gap: space[3],
    backgroundColor: color.ink800,
  },
  summaryTitle: {
    color: color.white,
    fontSize: type.size.titleSm,
    fontWeight: type.weight.heavy,
    textAlign: 'center',
  },
  summaryText: {
    color: color.whiteA75,
    fontSize: type.size.bodySm,
    lineHeight: type.size.bodySm * type.leading.body,
    textAlign: 'center',
  },
  shutterBar: {
    backgroundColor: color.ink900,
    paddingHorizontal: space[8],
    paddingTop: space[4],
    justifyContent: 'center',
    gap: space[3],
  },
  modeLabel: {
    textAlign: 'center',
    color: color.amber,
    fontSize: type.size.chip,
    fontWeight: type.weight.heavy,
    letterSpacing: 1.2,
  },
  shutterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sideHit: {
    width: 72,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: space.tapMin,
  },
  sideGhost: {
    width: 44,
    height: 44,
  },
  sideText: {
    fontSize: type.size.bodySm,
    fontWeight: type.weight.bold,
    color: color.white,
  },
  sideTextKeep: { fontWeight: type.weight.heavy },
  flipBtn: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: color.whiteA16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterRing: {
    width: SHUTTER_SIZE,
    height: SHUTTER_SIZE,
    borderRadius: radius.pill,
    borderWidth: 4,
    borderColor: color.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterOff: { opacity: 0.4 },
  shutterInner: {
    width: 68,
    height: 68,
    borderRadius: radius.pill,
    backgroundColor: color.danger,
  },
  shutterInnerStop: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: color.danger,
  },
  speedRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: space[2],
  },
  speedChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: color.whiteA16,
  },
  speedOn: { backgroundColor: color.accent },
  speedText: {
    color: color.white,
    fontSize: type.size.chip,
    fontWeight: type.weight.bold,
  },
  barHint: {
    textAlign: 'center',
    color: color.whiteA60,
    fontSize: type.size.chip,
    fontWeight: type.weight.semibold,
  },
  submitBtn: {
    height: space.tapPrimary,
    borderRadius: radius.pill,
    backgroundColor: color.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitText: {
    color: color.white,
    fontSize: type.size.action,
    fontWeight: type.weight.heavy,
  },
  toast: {
    position: 'absolute',
    left: space[7],
    right: space[7],
    bottom: 120,
    borderRadius: radius.md,
    backgroundColor: color.ink,
    paddingHorizontal: space[5],
    paddingVertical: 14,
    alignItems: 'center',
    zIndex: 30,
  },
  toastText: {
    color: color.white,
    fontWeight: type.weight.semibold,
    fontSize: type.size.meta,
    textAlign: 'center',
  },
});
