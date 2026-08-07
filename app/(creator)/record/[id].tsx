import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BeatPrompter, Teleprompter } from '../../../components/Teleprompter';
import { color, shadow } from '../../../theme/tokens';
import { useAuth } from '../../../lib/auth';
import {
  listBriefSegments,
  parseHookOptions,
  parseTalkingPoints,
  type BriefSegment,
} from '../../../lib/briefs-api';
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

type Phase =
  | 'idle'
  | 'countdown'
  | 'recording'
  | 'clipReview'
  | 'saving'
  | 'submitting'
  | 'sent';

/** One clip the creator records, in slot order. */
type ClipPlan = {
  slotIndex: number;
  kind: DraftSegmentKind;
  label: string;
  chip: string;
  script: string;
  scripted: boolean;
};

/** A kept take. Resumed drafts have no localUri; task clips have no storagePath. */
type KeptClip = {
  slotIndex: number;
  kind: DraftSegmentKind;
  durationMs: number;
  storagePath: string | null;
  localUri: string | null;
};

type PendingClip = { uri: string; durationMs: number };

/** 3-2-1 countdown steps at 800ms each (README §5). */
const COUNTDOWN_STEP_MS = 800;
/** Post-submit toast duration before returning Home (README §5). */
const TOAST_MS = 2600;

const SPEEDS = [0.75, 1, 1.25, 1.5] as const;
// Per-clip cap. Hooks run seconds, points under a minute; 90s is headroom,
// not a target.
const MAX_CLIP_MS = 90_000;
const STOP_WATCHDOG_MS = 5_000;

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

/**
 * The clip plan for a brief. Segments are the source of truth (kinds
 * hook | point | outro; slides belong to the upload screen). Briefs without
 * segments derive hook / points / outro; legacy script briefs record the
 * script in parts. Hook and outro are scripted (teleprompter); points are
 * beats the creator talks around.
 */
function briefPlan(brief: Brief, segments: BriefSegment[]): ClipPlan[] {
  // Legacy carousels (null post_type_id) still record their script as video;
  // only new-world carousels go through the upload screen.
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

export default function RecordScreen() {
  // Same screen serves both worlds: legacy tasks and campaign assignments
  // (routed with ?assignment=1). Both record clip by clip; only assignments
  // persist progress to recording_drafts.
  const { id, assignment: assignmentFlag } = useLocalSearchParams<{
    id: string;
    assignment?: string;
  }>();
  const isAssignment = assignmentFlag === '1';
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
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
  const [pendingClip, setPendingClip] = useState<PendingClip | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [scriptPaused, setScriptPaused] = useState(false);
  const [takeCount, setTakeCount] = useState(0);

  const recordingRef = useRef(false);
  const discardClipRef = useRef(false);
  const stopWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevBrightnessRef = useRef<number | null>(null);

  const brief = isAssignment ? assignment?.briefs ?? null : null;
  const title = (isAssignment ? brief?.title : task?.title) ?? '';

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
  const allKept =
    plan.length > 0 && plan.every((c) => kept[c.slotIndex] !== undefined);
  const keptCount = plan.filter((c) => kept[c.slotIndex] !== undefined).length;
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
          // New-world static posts pick photos instead of recording. Legacy
          // carousels (null post_type_id) keep the old record-a-video path
          // that post-approved still expects for them.
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
            const [segs, draft] = await Promise.all([
              listBriefSegments(a.briefs.id),
              loadDraftSegments(profile.company_id, a.id),
            ]);
            if (cancelled) return;
            setBriefSegments(segs);
            const resumed: Record<number, KeptClip> = {};
            for (const s of draft) {
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

  // Resume at the first missing clip; all clips kept resumes on the summary.
  useEffect(() => {
    if (loading || initialized || plan.length === 0) return;
    const first = plan.findIndex((c) => kept[c.slotIndex] === undefined);
    setActiveIndex(first === -1 ? null : first);
    setInitialized(true);
  }, [loading, initialized, plan, kept]);

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

  // Failsafe: if maxDuration never fires (Expo Go new arch), force a stop.
  useEffect(() => {
    if (phase !== 'recording') return;
    if (elapsedMs > MAX_CLIP_MS + 5000) stopClip();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, elapsedMs]);

  useEffect(() => {
    return () => {
      void restoreBrightness();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    recordingRef.current = true;
    discardClipRef.current = false;
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
    const startedAt = Date.now();
    try {
      // Pin H.264 so concat at approve time never mixes codecs across clips.
      // expo-camera 17 exposes no fps or audio sample rate control; those two
      // are normalized server-side in post-approved's single FFmpeg job.
      const clip = await cam.recordAsync({
        maxDuration: Math.ceil(MAX_CLIP_MS / 1000),
        codec: 'avc1',
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

  /**
   * Keep the take: assignments upload the clip right away and write it into
   * recording_drafts, so a killed app loses nothing. Legacy tasks keep the
   * clip locally and upload everything at submit, as before.
   */
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
    } catch (e) {
      setPhase('clipReview');
      Alert.alert(
        'Could not save the clip',
        e instanceof Error ? e.message : 'Check your connection and try again.',
      );
    }
  }

  function jumpToClip(index: number) {
    if (phase !== 'idle') return;
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
          // the submission is in; a stale draft row is harmless
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
      Alert.alert('Upload failed', e instanceof Error ? e.message : 'Try again');
    }
  }

  function onClose() {
    if (phase === 'sent' || phase === 'saving' || phase === 'submitting') return;
    if (phase === 'clipReview') {
      retakePending();
      return;
    }
    router.back();
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

  const showCamera =
    activeClip !== null &&
    (phase === 'idle' || phase === 'countdown' || phase === 'recording');
  const frontGlow = phase === 'recording' && flashOn && facing === 'front';
  const summaryMode = activeIndex === null && phase === 'idle';
  const chipsVisible = phase === 'idle';

  return (
    <View style={styles.root}>
      {showCamera ? (
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing={facing}
          mode="video"
          videoQuality="1080p"
          videoBitrate={8_000_000}
          enableTorch={flashOn && facing === 'back'}
          onCameraReady={() => setCameraReady(true)}
        />
      ) : null}

      {phase === 'clipReview' && pendingSource ? (
        <VideoView
          style={StyleSheet.absoluteFill}
          player={player}
          contentFit="cover"
          nativeControls={false}
        />
      ) : null}

      {frontGlow ? <View style={styles.frontGlow} pointerEvents="none" /> : null}

      <View style={[styles.progressWrap, { top: insets.top + 4 }]}>
        {plan.map((c, i) => {
          const isDone = kept[c.slotIndex] !== undefined;
          const isLive = phase === 'recording' && i === activeIndex;
          return (
            <View key={c.slotIndex} style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  isDone && styles.progressDone,
                  isLive && {
                    backgroundColor: '#FFFFFF',
                    flex: Math.min(elapsedMs / MAX_CLIP_MS, 1),
                  },
                  !isDone && !isLive && styles.progressEmpty,
                ]}
              />
              {isLive ? (
                <View
                  style={{ flex: Math.max(1 - elapsedMs / MAX_CLIP_MS, 0) }}
                />
              ) : null}
            </View>
          );
        })}
      </View>

      {showCamera && activeClip ? (
        <View style={[styles.prompterSlot, { paddingTop: insets.top + 48 }]}>
          {activeClip.scripted ? (
            <Teleprompter
              text={activeClip.script}
              running={phase === 'recording' && !scriptPaused}
              paused={phase === 'recording' && scriptPaused}
              speed={speed}
              speedLabel={`${speed}x`}
              resetKey={takeCount}
              onTap={() => {
                if (phase === 'recording') setScriptPaused((p) => !p);
              }}
            />
          ) : (
            <BeatPrompter
              label={`${activeClip.label} of ${plan.length} clips`}
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

      {phase !== 'sent' ? (
        <View style={[styles.topBar, { paddingTop: insets.top + 14 }]}>
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={styles.topBtn}>
              {phase === 'clipReview' ? 'Back' : 'Close'}
            </Text>
          </Pressable>
          <View style={styles.topCenter}>
            <Text style={styles.topTitle} numberOfLines={1}>
              {title}
            </Text>
            {activeClip && phase !== 'clipReview' ? (
              <Text style={styles.topSub}>
                Clip {(activeIndex ?? 0) + 1} of {plan.length}
              </Text>
            ) : null}
          </View>
          <View style={{ width: 48 }} />
        </View>
      ) : null}

      {showCamera ? (
        <View style={[styles.rail, { top: insets.top + 64 }]}>
          <Pressable
            style={[styles.railBtn, flashOn && styles.railBtnOn]}
            onPress={() => setFlashOn((f) => !f)}
            hitSlop={8}
          >
            <Text style={styles.railText}>Flash</Text>
          </Pressable>
          {phase !== 'recording' ? (
            <Pressable
              style={styles.railBtn}
              onPress={() => setFacing((f) => (f === 'front' ? 'back' : 'front'))}
              hitSlop={8}
            >
              <Text style={styles.railText}>Flip</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {summaryMode ? (
        <View style={styles.summaryWrap}>
          <Text style={styles.summaryTitle}>All clips recorded</Text>
          <Text style={styles.summaryText}>
            Your clips post as one video. Tap a clip below to record it again,
            or send everything for review.
          </Text>
        </View>
      ) : null}

      <View style={[styles.bottom, { paddingBottom: insets.bottom + 16 }]}>
        {chipsVisible && plan.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipsRow}
            style={styles.chipsScroll}
          >
            {plan.map((c, i) => {
              const isDone = kept[c.slotIndex] !== undefined;
              const isActive = i === activeIndex;
              return (
                <Pressable
                  key={c.slotIndex}
                  style={[
                    styles.chip,
                    isDone && styles.chipDone,
                    isActive && styles.chipActive,
                  ]}
                  onPress={() => jumpToClip(i)}
                >
                  <Text style={[styles.chipText, isDone && styles.chipTextDone]}>
                    {c.chip}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}

        {phase === 'idle' && activeClip !== null ? (
          <>
            {activeClip.scripted ? (
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
            ) : null}
            <Text style={styles.hintSmall}>
              {replacing
                ? 'This take replaces the clip you already kept.'
                : activeClip.scripted
                  ? 'Read the script. Stop when you finish this clip.'
                  : 'Talk through the point in your own words.'}
            </Text>
            <View style={styles.shutterRow}>
              <View style={styles.shutterSide}>
                {allKept ? (
                  <Pressable
                    style={styles.doneBtn}
                    onPress={() => setActiveIndex(null)}
                  >
                    <Text style={styles.doneText}>Done</Text>
                  </Pressable>
                ) : null}
              </View>
              <Pressable
                style={[styles.shutter, !cameraReady && styles.shutterOff]}
                disabled={!cameraReady}
                onPress={() => void beginCountdown()}
              >
                <View style={styles.shutterInner} />
              </Pressable>
              <View style={styles.shutterSide}>
                <Text style={styles.hintSmall}>
                  {cameraReady
                    ? `${keptCount} of ${plan.length} kept`
                    : 'Camera starting'}
                </Text>
              </View>
            </View>
          </>
        ) : null}

        {phase === 'countdown' ? <Text style={styles.hint}>Get ready</Text> : null}

        {phase === 'recording' ? (
          <View style={styles.recCol}>
            <Text style={styles.timer}>
              {formatMs(elapsedMs)} / {formatMs(MAX_CLIP_MS)}
            </Text>
            <Pressable style={styles.stopBtn} onPress={stopClip}>
              <View style={styles.stopSquare} />
            </Pressable>
            <Text style={styles.hintSmall}>Stop when you finish this clip</Text>
          </View>
        ) : null}

        {phase === 'clipReview' && activeClip ? (
          <View style={styles.reviewCol}>
            <Text style={styles.hintSmall}>
              {activeClip.label}. Happy with it? Keep it and move on.
            </Text>
            <View style={styles.reviewRow}>
              <Pressable style={styles.secondaryBtn} onPress={retakePending}>
                <Text style={styles.secondaryText}>Retake</Text>
              </Pressable>
              <Pressable
                style={styles.primaryBtn}
                onPress={() => void keepPendingClip()}
              >
                <Text style={styles.primaryText}>Keep clip</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {phase === 'saving' ? (
          <View style={styles.recCol}>
            <ActivityIndicator color="#FFFFFF" />
            <Text style={styles.hint}>Saving your clip…</Text>
          </View>
        ) : null}

        {summaryMode ? (
          <Pressable
            style={[styles.primaryBtn, styles.submitBtn]}
            onPress={() => void sendForReview()}
          >
            <Text style={styles.primaryText}>Send for review</Text>
          </Pressable>
        ) : null}

        {phase === 'submitting' ? (
          <Text style={styles.hint}>Sending for review…</Text>
        ) : null}
      </View>

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
  },
  fallbackText: { color: 'rgba(255,255,255,0.7)', fontSize: 16 },
  frontGlow: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 26,
    borderColor: '#FFFFFF',
  },
  progressWrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    height: 5,
    flexDirection: 'row',
    gap: 3,
    zIndex: 10,
  },
  progressTrack: {
    flex: 1,
    flexDirection: 'row',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: { flex: 1, borderRadius: 3 },
  progressDone: { backgroundColor: color.accent },
  progressEmpty: { backgroundColor: 'rgba(255,255,255,0.25)' },
  prompterSlot: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  countdownWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
  countdown: { fontSize: 96, fontWeight: '800', color: '#fff' },
  countdownHint: { color: 'rgba(255,255,255,0.7)', fontWeight: '600' },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 15,
  },
  topBtn: { color: '#fff', fontWeight: '700', fontSize: 16, width: 48 },
  topCenter: { flex: 1, alignItems: 'center', gap: 1 },
  topTitle: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
    textAlign: 'center',
  },
  topSub: {
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '600',
    fontSize: 12,
  },
  rail: {
    position: 'absolute',
    right: 12,
    gap: 10,
    alignItems: 'flex-end',
    zIndex: 15,
  },
  railBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,32,0.55)',
    alignItems: 'center',
  },
  railBtnOn: { backgroundColor: color.accent },
  railText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  summaryWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 10,
  },
  summaryTitle: { color: '#fff', fontWeight: '800', fontSize: 24 },
  summaryText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 15,
    lineHeight: 21,
    textAlign: 'center',
  },
  bottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 20,
  },
  chipsScroll: { maxHeight: 44, flexGrow: 0 },
  chipsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 4,
    alignItems: 'center',
  },
  chip: {
    minWidth: 40,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
  },
  chipDone: { backgroundColor: color.accent },
  chipActive: { borderColor: '#FFFFFF' },
  chipText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  chipTextDone: { color: '#fff' },
  speedRow: { flexDirection: 'row', gap: 8 },
  speedChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  speedOn: { backgroundColor: color.accent },
  speedText: { color: '#fff', fontWeight: '700' },
  shutterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    justifyContent: 'center',
    gap: 12,
  },
  shutterSide: { flex: 1, alignItems: 'center' },
  shutter: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 4,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterOff: { opacity: 0.4 },
  shutterInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: color.accent,
  },
  doneBtn: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  doneText: { color: '#000', fontWeight: '800', fontSize: 15 },
  recCol: { alignItems: 'center', gap: 10 },
  timer: { color: '#fff', fontWeight: '800', fontSize: 18 },
  stopBtn: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  stopSquare: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: color.accent,
  },
  reviewCol: { width: '100%', alignItems: 'center', gap: 10 },
  reviewRow: { flexDirection: 'row', gap: 12, width: '100%' },
  secondaryBtn: {
    flex: 1,
    height: 48,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  primaryBtn: {
    flex: 1.4,
    height: 48,
    borderRadius: 999,
    backgroundColor: color.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtn: { flex: 0, alignSelf: 'stretch' },
  primaryText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  hint: { color: '#fff', fontSize: 16, fontWeight: '600' },
  hintSmall: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  toast: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 104,
    borderRadius: 16,
    backgroundColor: color.ink,
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: 'center',
    zIndex: 30,
  },
  toastText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
    textAlign: 'center',
  },
});
