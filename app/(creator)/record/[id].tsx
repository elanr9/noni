import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Teleprompter } from '../../../components/Teleprompter';
import { color, shadow } from '../../../theme/tokens';
import { useAuth } from '../../../lib/auth';
import {
  getAssignment,
  getTask,
  type AssignmentWithBrief,
} from '../../../lib/tasks-api';
import {
  submitAssignmentRecording,
  submitRecording,
  type RecordedSegment,
} from '../../../lib/submissions';
import type { ContentTask } from '../../../lib/tasks';

type Phase = 'idle' | 'countdown' | 'recording' | 'review' | 'uploading' | 'sent';

/** 3-2-1 countdown steps at 800ms each (README §5). */
const COUNTDOWN_STEP_MS = 800;
/** Post-submit toast duration before returning Home (README §5). */
const TOAST_MS = 2600;

const SPEEDS = [0.75, 1, 1.25, 1.5] as const;
const MAX_TOTAL_MS = 90_000;
const STOP_WATCHDOG_MS = 5_000;

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

function formatMs(ms: number): string {
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function RecordScreen() {
  // Same screen serves both worlds: legacy tasks and campaign assignments
  // (routed with ?assignment=1). The teleprompter flow is identical.
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
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<Phase>('idle');
  const [countdown, setCountdown] = useState(3);
  const [cameraReady, setCameraReady] = useState(false);
  const [facing, setFacing] = useState<CameraType>('front');
  const [flashOn, setFlashOn] = useState(false);
  const [segments, setSegments] = useState<RecordedSegment[]>([]);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [scriptPaused, setScriptPaused] = useState(false);
  const [takeCount, setTakeCount] = useState(0);
  const [reviewIndex, setReviewIndex] = useState(0);

  const recordingRef = useRef(false);
  const discardClipRef = useRef(false);
  const stopWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevBrightnessRef = useRef<number | null>(null);

  const rawScript = isAssignment ? assignment?.briefs.script : task?.script;
  const title = (isAssignment ? assignment?.briefs.title : task?.title) ?? '';
  const script = rawScript?.trim() || 'No script on this task. Speak freely.';
  const parts = useMemo(() => splitScriptParts(script), [script]);
  const partIndex = Math.min(segments.length, parts.length - 1);
  const totalRecordedMs = segments.reduce((sum, s) => sum + s.durationMs, 0);
  const remainingMs = MAX_TOTAL_MS - totalRecordedMs;
  const maxReached = remainingMs < 1000;
  const nextPartCard =
    phase === 'idle' &&
    segments.length > 0 &&
    parts.length > 1 &&
    segments.length < parts.length;

  const reviewSource =
    phase === 'review' ? (segments[reviewIndex]?.uri ?? null) : null;
  const player = useVideoPlayer(reviewSource, (p) => {
    p.loop = segments.length === 1;
    if (reviewSource) p.play();
  });

  useEffect(() => {
    if (!id) return;
    if (isAssignment) {
      void getAssignment(id)
        .then(setAssignment)
        .finally(() => setLoading(false));
    } else {
      void getTask(id)
        .then(setTask)
        .finally(() => setLoading(false));
    }
  }, [id, isAssignment]);

  useEffect(() => {
    if (phase !== 'review' || segments.length < 2) return;
    const sub = player.addListener('playToEnd', () => {
      setReviewIndex((i) => (i + 1) % segments.length);
    });
    return () => sub.remove();
  }, [player, phase, segments.length]);

  useEffect(() => {
    if (phase !== 'countdown') return;
    if (countdown <= 0) {
      void startSegment();
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
    if (totalRecordedMs + elapsedMs > MAX_TOTAL_MS + 5000) stopSegment();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, elapsedMs, totalRecordedMs]);

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
    if (recordingRef.current || maxReached) return;
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

  function finishSegment() {
    recordingRef.current = false;
    if (stopWatchdogRef.current) {
      clearTimeout(stopWatchdogRef.current);
      stopWatchdogRef.current = null;
    }
    setPhase((p) => (p === 'recording' ? 'idle' : p));
    void restoreBrightness();
  }

  async function startSegment() {
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
      const clip = await cam.recordAsync({
        maxDuration: Math.max(1, Math.ceil(remainingMs / 1000)),
      });
      if (discardClipRef.current) {
        discardClipRef.current = false;
      } else if (clip?.uri) {
        const durationMs = Math.max(500, Date.now() - startedAt);
        setSegments((s) => [...s, { uri: clip.uri, durationMs }]);
      } else {
        Alert.alert('Clip not saved', 'That take did not save. Record it again.');
      }
    } catch (e) {
      Alert.alert(
        'Recording failed',
        e instanceof Error ? e.message : 'Try again',
      );
    } finally {
      finishSegment();
    }
  }

  function stopSegment() {
    if (!recordingRef.current) return;
    cameraRef.current?.stopRecording();
    if (stopWatchdogRef.current) clearTimeout(stopWatchdogRef.current);
    stopWatchdogRef.current = setTimeout(() => {
      if (recordingRef.current) {
        discardClipRef.current = true;
        finishSegment();
        Alert.alert(
          'Camera stalled',
          'That clip could not be saved. Record it again.',
        );
      }
    }, STOP_WATCHDOG_MS);
  }

  function deleteLastSegment() {
    setSegments((s) => s.slice(0, -1));
  }

  function retakeAll() {
    setSegments([]);
    setReviewIndex(0);
    setScriptPaused(false);
    setPhase('idle');
  }

  async function sendForReview() {
    if (!profile || segments.length === 0) return;
    if (isAssignment ? !assignment : !task) return;
    setPhase('uploading');
    try {
      if (assignment) {
        await submitAssignmentRecording({
          assignment,
          companyId: profile.company_id,
          creatorId: profile.id,
          segments,
        });
      } else if (task) {
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
      setPhase('review');
      Alert.alert('Upload failed', e instanceof Error ? e.message : 'Try again');
    }
  }

  function onClose() {
    if (phase === 'sent') return;
    if (phase === 'review') {
      setReviewIndex(0);
      setPhase('idle');
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

  const showCamera = phase === 'idle' || phase === 'countdown' || phase === 'recording';
  const frontGlow = phase === 'recording' && flashOn && facing === 'front';

  return (
    <View style={styles.root}>
      {showCamera ? (
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing={facing}
          mode="video"
          videoQuality="1080p"
          enableTorch={flashOn && facing === 'back'}
          onCameraReady={() => setCameraReady(true)}
        />
      ) : null}

      {phase === 'review' && reviewSource ? (
        <VideoView
          style={StyleSheet.absoluteFill}
          player={player}
          contentFit="cover"
          nativeControls={false}
        />
      ) : null}

      {frontGlow ? <View style={styles.frontGlow} pointerEvents="none" /> : null}

      <View style={[styles.progressWrap, { top: insets.top + 4 }]}>
        {segments.map((s, i) => (
          <View
            key={`${i}-${s.uri}`}
            style={[
              styles.progressSeg,
              { flex: s.durationMs / MAX_TOTAL_MS },
            ]}
          />
        ))}
        {phase === 'recording' ? (
          <View
            style={[
              styles.progressSeg,
              styles.progressLive,
              { flex: Math.min(elapsedMs, remainingMs) / MAX_TOTAL_MS },
            ]}
          />
        ) : null}
        <View
          style={{
            flex: Math.max(
              MAX_TOTAL_MS -
                totalRecordedMs -
                (phase === 'recording' ? Math.min(elapsedMs, remainingMs) : 0),
              0,
            ) / MAX_TOTAL_MS,
          }}
        />
      </View>

      {showCamera ? (
        <View style={[styles.prompterSlot, { paddingTop: insets.top + 48 }]}>
          <Teleprompter
            text={parts[partIndex] ?? script}
            running={phase === 'recording' && !scriptPaused}
            paused={phase === 'recording' && scriptPaused}
            speed={speed}
            speedLabel={`${speed}x`}
            resetKey={takeCount}
            onTap={() => {
              if (phase === 'recording') setScriptPaused((p) => !p);
            }}
          />
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
              {phase === 'review' ? 'Back' : 'Close'}
            </Text>
          </Pressable>
          <Text style={styles.topTitle} numberOfLines={1}>
            {title}
          </Text>
          <View style={{ width: 48 }} />
        </View>
      ) : null}

      {showCamera ? (
        <View style={[styles.rail, { top: insets.top + 56 }]}>
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

      <View style={[styles.bottom, { paddingBottom: insets.bottom + 16 }]}>
        {phase === 'idle' && segments.length > 0 ? (
          <View style={styles.pillsRow}>
            {segments.map((s, i) => (
              <View key={`${i}-${s.uri}`} style={styles.pill}>
                <Text style={styles.pillText}>
                  {i + 1} · {formatMs(s.durationMs)}
                </Text>
              </View>
            ))}
            <Pressable style={styles.deletePill} onPress={deleteLastSegment}>
              <Text style={styles.deleteText}>Delete last</Text>
            </Pressable>
          </View>
        ) : null}

        {nextPartCard ? (
          <View style={styles.partCard}>
            <Text style={styles.partTitle}>
              Part {segments.length + 1} of {parts.length}
            </Text>
            <Text style={styles.partPreview} numberOfLines={2}>
              {parts[segments.length]}
            </Text>
            <Pressable
              style={styles.partFlip}
              onPress={() => setFacing((f) => (f === 'front' ? 'back' : 'front'))}
            >
              <Text style={styles.partFlipText}>Flip camera</Text>
            </Pressable>
          </View>
        ) : null}

        {phase === 'idle' || phase === 'countdown' ? (
          <>
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
            {phase === 'idle' && segments.length === 0 && parts.length > 1 ? (
              <Text style={styles.hintSmall}>
                {parts.length} parts. Stop between each to cut and continue.
              </Text>
            ) : null}
            {phase === 'idle' ? (
              <View style={styles.shutterRow}>
                <View style={styles.shutterSide}>
                  {segments.length > 0 ? (
                    <Pressable style={styles.doneBtn} onPress={() => setPhase('review')}>
                      <Text style={styles.doneText}>Done</Text>
                    </Pressable>
                  ) : null}
                </View>
                <Pressable
                  style={[
                    styles.shutter,
                    (!cameraReady || maxReached) && styles.shutterOff,
                  ]}
                  disabled={!cameraReady || maxReached}
                  onPress={() => void beginCountdown()}
                >
                  <View style={styles.shutterInner} />
                </Pressable>
                <View style={styles.shutterSide}>
                  <Text style={styles.hintSmall}>
                    {!cameraReady
                      ? 'Camera starting'
                      : maxReached
                        ? 'Max length'
                        : formatMs(remainingMs) + ' left'}
                  </Text>
                </View>
              </View>
            ) : (
              <Text style={styles.hint}>Get ready</Text>
            )}
          </>
        ) : null}

        {phase === 'recording' ? (
          <View style={styles.recCol}>
            <Text style={styles.timer}>
              {formatMs(totalRecordedMs + elapsedMs)} / {formatMs(MAX_TOTAL_MS)}
            </Text>
            <Pressable style={styles.stopBtn} onPress={stopSegment}>
              <View style={styles.stopSquare} />
            </Pressable>
            <Text style={styles.hintSmall}>Stop saves this clip</Text>
          </View>
        ) : null}

        {phase === 'review' ? (
          <View style={styles.reviewCol}>
            <Text style={styles.hintSmall}>
              {segments.length === 1
                ? 'One clip'
                : `Clip ${reviewIndex + 1} of ${segments.length}. Clips post as one video.`}
            </Text>
            <View style={styles.reviewRow}>
              <Pressable style={styles.secondaryBtn} onPress={retakeAll}>
                <Text style={styles.secondaryText}>Retake all</Text>
              </Pressable>
              <Pressable
                style={styles.primaryBtn}
                onPress={() => void sendForReview()}
              >
                <Text style={styles.primaryText}>Send for review</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {phase === 'uploading' ? (
          <Text style={styles.hint}>
            {segments.length > 1
              ? `Uploading ${segments.length} clips…`
              : 'Uploading your take…'}
          </Text>
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
  progressSeg: {
    backgroundColor: color.accent,
    borderRadius: 3,
  },
  progressLive: { backgroundColor: '#FFFFFF' },
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
  topTitle: {
    flex: 1,
    textAlign: 'center',
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
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
  bottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 20,
  },
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  pillText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  deletePill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
  },
  deleteText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  partCard: {
    width: '100%',
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    padding: 14,
    gap: 6,
    alignItems: 'center',
  },
  partTitle: { color: color.accentTint, fontWeight: '800', fontSize: 15 },
  partPreview: {
    color: '#fff',
    fontSize: 14,
    textAlign: 'center',
    opacity: 0.9,
  },
  partFlip: {
    marginTop: 4,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#fff',
  },
  partFlipText: { color: '#fff', fontWeight: '700', fontSize: 13 },
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
