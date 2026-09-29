import { useCallback, useMemo, useState } from 'react';

type History<T> = {
  past: T[];
  present: T;
  future: T[];
};

const MAX_PAST = 100;

/** Undo/redo stack over one immutable document. `commit` ignores no ops. */
export function useEditHistory<T>(initial: T) {
  const [history, setHistory] = useState<History<T>>({
    past: [],
    present: initial,
    future: [],
  });

  const commit = useCallback((next: T | ((prev: T) => T)) => {
    setHistory((h) => {
      const resolved = typeof next === 'function' ? (next as (prev: T) => T)(h.present) : next;
      if (resolved === h.present) return h;
      return {
        past: [...h.past.slice(-(MAX_PAST - 1)), h.present],
        present: resolved,
        future: [],
      };
    });
  }, []);

  /** Replace the present without adding an undo step (edits owned elsewhere). */
  const amend = useCallback((next: T | ((prev: T) => T)) => {
    setHistory((h) => {
      const resolved = typeof next === 'function' ? (next as (prev: T) => T)(h.present) : next;
      if (resolved === h.present) return h;
      return { ...h, present: resolved };
    });
  }, []);

  /** Replace the present and drop both stacks (used after a re-record or once
   * edits are baked into a fresh clip). */
  const reset = useCallback((next: T) => {
    setHistory({ past: [], present: next, future: [] });
  }, []);

  const undo = useCallback(() => {
    setHistory((h) => {
      const prev = h.past[h.past.length - 1];
      if (prev === undefined) return h;
      return {
        past: h.past.slice(0, -1),
        present: prev,
        future: [h.present, ...h.future],
      };
    });
  }, []);

  const redo = useCallback(() => {
    setHistory((h) => {
      const next = h.future[0];
      if (next === undefined) return h;
      return {
        past: [...h.past, h.present],
        present: next,
        future: h.future.slice(1),
      };
    });
  }, []);

  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;
  const present = history.present;

  return useMemo(
    () => ({ present, canUndo, canRedo, commit, amend, reset, undo, redo }),
    [present, canUndo, canRedo, commit, amend, reset, undo, redo],
  );
}
