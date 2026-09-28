// Coalesces rapid edits: the last call per key runs once the creator has
// been still for the delay. Pending work flushes on unmount so nothing is lost.
import { useCallback, useEffect, useRef } from 'react';

const DEFAULT_DELAY_MS = 400;

export function useDebouncedCommit(delayMs = DEFAULT_DELAY_MS): {
  schedule: (key: string, run: () => void) => void;
} {
  const timers = useRef(new Map<string, { handle: ReturnType<typeof setTimeout>; run: () => void }>());

  const schedule = useCallback(
    (key: string, run: () => void) => {
      const pending = timers.current.get(key);
      if (pending) clearTimeout(pending.handle);
      const handle = setTimeout(() => {
        timers.current.delete(key);
        run();
      }, delayMs);
      timers.current.set(key, { handle, run });
    },
    [delayMs],
  );

  useEffect(() => {
    const map = timers.current;
    return () => {
      for (const { handle, run } of map.values()) {
        clearTimeout(handle);
        run();
      }
      map.clear();
    };
  }, []);

  return { schedule };
}
