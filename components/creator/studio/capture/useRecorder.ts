import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { Alert } from 'react-native';
import type { CameraView } from 'expo-camera';
import * as Brightness from 'expo-brightness';

import type { MediaAsset } from '../../../../lib/edit-document';
import { MAX_CLIP_MS, MIN_TAKE_MS, RECORD_ARM_MS, STOP_WATCHDOG_MS } from './constants';
import { videoAsset } from './media-assets';

export type RecorderPhase = 'idle' | 'starting' | 'recording' | 'saving';

export type Recorder = {
  phase: RecorderPhase;
  /** Wall-clock start of the live take, null unless recording. */
  startedAt: number | null;
  start(): void;
  stop(): void;
};

type Params = {
  cameraRef: RefObject<CameraView | null>;
  cameraReadyAt: number | null;
  /** True when the creator wants flash on the front camera: max screen brightness. */
  frontFlash: boolean;
  onAsset(asset: MediaAsset): void;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function useRecorder({ cameraRef, cameraReadyAt, frontFlash, onAsset }: Params): Recorder {
  const [phase, setPhaseState] = useState<RecorderPhase>('idle');
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const phaseRef = useRef<RecorderPhase>('idle');
  const sessionRef = useRef(0);
  const cancelRef = useRef(false);
  const recordStartAtRef = useRef(0);
  const prevBrightnessRef = useRef<number | null>(null);
  const stopDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onAssetRef = useRef(onAsset);

  useEffect(() => {
    onAssetRef.current = onAsset;
  }, [onAsset]);

  const setPhase = useCallback((next: RecorderPhase) => {
    phaseRef.current = next;
    setPhaseState(next);
  }, []);

  const clearTimers = useCallback(() => {
    if (stopDelayRef.current) clearTimeout(stopDelayRef.current);
    if (watchdogRef.current) clearTimeout(watchdogRef.current);
    stopDelayRef.current = null;
    watchdogRef.current = null;
  }, []);

  const restoreBrightness = useCallback(async () => {
    const prev = prevBrightnessRef.current;
    prevBrightnessRef.current = null;
    if (prev === null) return;
    try {
      await Brightness.setBrightnessAsync(prev);
    } catch {
      // Nothing to do; the system resets brightness when the app backgrounds.
    }
  }, []);

  useEffect(
    () => () => {
      sessionRef.current += 1;
      clearTimers();
      void restoreBrightness();
    },
    [clearTimers, restoreBrightness],
  );

  const start = useCallback(() => {
    const cam = cameraRef.current;
    if (!cam || phaseRef.current !== 'idle' || cameraReadyAt === null) return;
    const session = ++sessionRef.current;
    cancelRef.current = false;
    setPhase('starting');

    void (async () => {
      if (frontFlash) {
        try {
          prevBrightnessRef.current = await Brightness.getBrightnessAsync();
          await Brightness.setBrightnessAsync(1);
        } catch {
          prevBrightnessRef.current = null;
        }
      }
      const armWait = Math.max(0, cameraReadyAt + RECORD_ARM_MS - Date.now());
      if (armWait > 0) await sleep(armWait);
      if (sessionRef.current !== session) return;
      if (cancelRef.current) {
        await restoreBrightness();
        setPhase('idle');
        return;
      }
      const begunAt = Date.now();
      recordStartAtRef.current = begunAt;
      setStartedAt(begunAt);
      setPhase('recording');
      try {
        const result = await cam.recordAsync({ codec: 'avc1', maxDuration: MAX_CLIP_MS / 1000 });
        if (sessionRef.current !== session) return;
        clearTimers();
        setStartedAt(null);
        if (result?.uri) {
          setPhase('saving');
          const asset = await videoAsset(result.uri, Math.max(MIN_TAKE_MS, Date.now() - begunAt));
          if (sessionRef.current !== session) return;
          onAssetRef.current(asset);
        } else {
          Alert.alert('Clip not saved', 'That take did not save. Record it again.');
        }
      } catch (e) {
        if (sessionRef.current !== session) return;
        Alert.alert('Recording failed', e instanceof Error ? e.message : 'Try again.');
      } finally {
        if (sessionRef.current === session) {
          clearTimers();
          setStartedAt(null);
          setPhase('idle');
          void restoreBrightness();
        }
      }
    })();
  }, [cameraRef, cameraReadyAt, frontFlash, clearTimers, restoreBrightness, setPhase]);

  const stop = useCallback(() => {
    const current = phaseRef.current;
    if (current === 'starting') {
      cancelRef.current = true;
      return;
    }
    if (current !== 'recording' || stopDelayRef.current) return;
    // A stop right after start hands AVFoundation nothing to write.
    const stopIn = Math.max(0, MIN_TAKE_MS - (Date.now() - recordStartAtRef.current));
    stopDelayRef.current = setTimeout(() => {
      stopDelayRef.current = null;
      cameraRef.current?.stopRecording();
    }, stopIn);
    watchdogRef.current = setTimeout(() => {
      if (phaseRef.current !== 'recording') return;
      sessionRef.current += 1;
      clearTimers();
      setStartedAt(null);
      setPhase('idle');
      void restoreBrightness();
      Alert.alert('Camera stalled', 'That clip could not be saved. Record it again.');
    }, STOP_WATCHDOG_MS + stopIn);
  }, [cameraRef, clearTimers, restoreBrightness, setPhase]);

  return { phase, startedAt, start, stop };
}
