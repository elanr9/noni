import { useEffect, useRef, useState } from 'react';

import { useStudioStore } from '../../../../lib/studio-store';

const TICK_MS = 33;

/** Advances the store playhead in wall time while nothing native is
 * playing: image only documents, and image blocks on the Android fallback. */
export function useJsClock(enabled: boolean, totalMs: number): void {
  const playing = useStudioStore((s) => s.playing);

  useEffect(() => {
    if (!enabled || !playing || totalMs <= 0) return;
    const store = useStudioStore.getState();
    if (store.playheadMs >= totalMs) store.setPlayhead(0);
    let last = Date.now();
    const id = setInterval(() => {
      const now = Date.now();
      const { playheadMs, setPlayhead, setPlaying } = useStudioStore.getState();
      const next = playheadMs + (now - last);
      last = now;
      if (next >= totalMs) {
        setPlayhead(totalMs);
        setPlaying(false);
        return;
      }
      setPlayhead(next);
    }, TICK_MS);
    return () => clearInterval(id);
  }, [enabled, playing, totalMs]);
}

/** Latest value, re-emitted at most once per `waitMs` so a 30Hz gesture
 * does not rebuild the native composition on every tick. */
export function useThrottledValue<T>(value: T, waitMs: number): T {
  const [shown, setShown] = useState(value);
  const lastAt = useRef(0);

  useEffect(() => {
    const elapsed = Date.now() - lastAt.current;
    if (elapsed >= waitMs) {
      lastAt.current = Date.now();
      setShown(value);
      return;
    }
    const id = setTimeout(() => {
      lastAt.current = Date.now();
      setShown(value);
    }, waitMs - elapsed);
    return () => clearTimeout(id);
  }, [value, waitMs]);

  return shown;
}
