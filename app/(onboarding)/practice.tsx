import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '../../components/Screen';
import { Teleprompter } from '../../components/Teleprompter';
import { useAuth } from '../../lib/auth';
import { completeOnboarding } from '../../lib/onboarding';

type Phase = 'idle' | 'countdown' | 'recording' | 'review';

const MAX_MS = 15_000;
const STOP_WATCHDOG_MS = 5_000;

const SAMPLE_TEXT =
  'Hi, I am practicing with the Noni teleprompter. The words scroll while I talk, and I keep my eyes near the camera. When I am recording real tasks the script will be written for me. That is it, easy.';

export default function PracticeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile, refreshProfile } = useAuth();
  const cameraRef = useRef<CameraView>(null);

  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();

  const [phase, setPhase] = useState<Phase>('idle');
  const [countdown, setCountdown] = useState(3);
  const [cameraReady, setCameraReady] = useState(false);
  const [clipUri, setClipUri] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [takeCount, setTakeCount] = useState(0);
  const [finishing, setFinishing] = useState(false);

  const recordingRef = useRef(false);
  const discardClipRef = useRef(false);
  const stopWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const player = useVideoPlayer(phase === 'review' ? clipUri : null, (p) => {
    p.loop = true;
    if (clipUri) p.play();
  });

  useEffect(() => {
    if (phase !== 'countdown') return;
    if (countdown <= 0) {
      void startRecording();
      return;
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
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
    if (elapsedMs > MAX_MS + 2000) stopRecording();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, elapsedMs]);

  async function beginCountdown() {
    if (recordingRef.current) return;
    const cam = cameraPermission?.granted ? cameraPermission : await requestCameraPermission();
    const mic = micPermission?.granted ? micPermission : await requestMicPermission();
    if (!cam?.granted || !mic?.granted) {
      Alert.alert('Camera and mic needed', 'Both are needed to practice recording.');
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

  function finishRecording() {
    recordingRef.current = false;
    if (stopWatchdogRef.current) {
      clearTimeout(stopWatchdogRef.current);
      stopWatchdogRef.current = null;
    }
  }

  async function startRecording() {
    const cam = cameraRef.current;
    if (!cam || recordingRef.current) {
      setPhase('idle');
      return;
    }
    recordingRef.current = true;
    discardClipRef.current = false;
    setElapsedMs(0);
    setPhase('recording');
    try {
      const clip = await cam.recordAsync({ maxDuration: MAX_MS / 1000 });
      if (!discardClipRef.current && clip?.uri) {
        setClipUri(clip.uri);
        setPhase('review');
      } else {
        setPhase('idle');
      }
    } catch (e) {
      setPhase('idle');
      Alert.alert('Recording failed', e instanceof Error ? e.message : 'Try again');
    } finally {
      finishRecording();
    }
  }

  function stopRecording() {
    if (!recordingRef.current) return;
    cameraRef.current?.stopRecording();
    if (stopWatchdogRef.current) clearTimeout(stopWatchdogRef.current);
    stopWatchdogRef.current = setTimeout(() => {
      if (recordingRef.current) {
        discardClipRef.current = true;
        finishRecording();
        setPhase('idle');
        Alert.alert('Camera stalled', 'That clip could not be saved. Try again.');
      }
    }, STOP_WATCHDOG_MS);
  }

  function retake() {
    setClipUri(null);
    setPhase('idle');
  }

  async function finish() {
    if (!profile || finishing) return;
    setFinishing(true);
    try {
      await completeOnboarding(profile.id);
      await refreshProfile();
      router.replace('/(creator)/(tabs)');
    } catch (e) {
      setFinishing(false);
      Alert.alert('Could not finish', e instanceof Error ? e.message : 'Try again');
    }
  }

  const showCamera = phase !== 'review';

  return (
    <View style={styles.root}>
      {showCamera ? (
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing="front"
          mode="video"
          videoQuality="1080p"
          onCameraReady={() => setCameraReady(true)}
        />
      ) : null}

      {phase === 'review' && clipUri ? (
        <VideoView
          style={StyleSheet.absoluteFill}
          player={player}
          contentFit="cover"
          nativeControls={false}
        />
      ) : null}

      {showCamera ? (
        <View style={[styles.prompterSlot, { paddingTop: insets.top + 48 }]}>
          <Teleprompter
            text={SAMPLE_TEXT}
            running={phase === 'recording'}
            paused={false}
            speed={1}
            resetKey={takeCount}
          />
        </View>
      ) : null}

      {phase === 'countdown' ? (
        <Pressable style={styles.countdownWrap} onPress={() => setPhase('idle')}>
          <Text style={styles.countdown}>{countdown}</Text>
          <Text style={styles.countdownHint}>Tap to cancel</Text>
        </Pressable>
      ) : null}

      <View style={[styles.topBar, { paddingTop: insets.top + 14 }]}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.topBtn}>Back</Text>
        </Pressable>
        <Text style={styles.topTitle}>Practice run</Text>
        <Pressable onPress={() => void finish()} hitSlop={12}>
          <Text style={styles.topBtn}>Skip</Text>
        </Pressable>
      </View>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + 16 }]}>
        {phase === 'idle' ? (
          <>
            <Text style={styles.hint}>
              {cameraReady
                ? 'Read the script out loud. 15 seconds, throwaway clip.'
                : 'Camera starting'}
            </Text>
            <Pressable
              style={[styles.shutter, !cameraReady && styles.shutterOff]}
              disabled={!cameraReady}
              onPress={() => void beginCountdown()}
            >
              <View style={styles.shutterInner} />
            </Pressable>
          </>
        ) : null}

        {phase === 'recording' ? (
          <>
            <Text style={styles.timer}>
              {Math.min(Math.round(elapsedMs / 1000), 15)}s / 15s
            </Text>
            <Pressable style={styles.stopBtn} onPress={stopRecording}>
              <View style={styles.stopSquare} />
            </Pressable>
          </>
        ) : null}

        {phase === 'review' ? (
          <View style={styles.reviewRow}>
            <Pressable style={styles.secondaryBtn} onPress={retake}>
              <Text style={styles.secondaryText}>Try again</Text>
            </Pressable>
            <Pressable style={styles.primaryBtn} onPress={() => void finish()}>
              <Text style={styles.primaryText}>
                {finishing ? 'Finishing…' : 'I got it, finish'}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  prompterSlot: { position: 'absolute', top: 0, left: 0, right: 0 },
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
  topBtn: { color: '#fff', fontWeight: '700', fontSize: 16 },
  topTitle: { color: '#fff', fontWeight: '700', fontSize: 15 },
  bottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 20,
  },
  hint: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
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
    backgroundColor: colors.accent,
  },
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
    backgroundColor: colors.accent,
  },
  reviewRow: { flexDirection: 'row', gap: 12, width: '100%' },
  secondaryBtn: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
  },
  secondaryText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  primaryBtn: {
    flex: 1.4,
    paddingVertical: 16,
    borderRadius: 16,
    backgroundColor: colors.accent,
    alignItems: 'center',
  },
  primaryText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
