import { useCallback, useState } from 'react';

import type { EditTimeline } from '../../../lib/video-edit';

type History = {
  past: EditTimeline[];
  present: EditTimeline;
  future: EditTimeline[];
};

const MAX_PAST = 100;

/** Undo/redo stack over the committed timeline. `commit` ignores no ops. */
export function useEditHistory(initial: EditTimeline) {
  const [history, setHistory] = useState<History>({
    past: [],
    present: initial,
    future: [],
  });

  const commit = useCallback((next: EditTimeline | ((prev: EditTimeline) => EditTimeline)) => {
    setHistory((h) => {
      const resolved = typeof next === 'function' ? next(h.present) : next;
      if (resolved === h.present) return h;
      return {
        past: [...h.past.slice(-(MAX_PAST - 1)), h.present],
        present: resolved,
        future: [],
      };
    });
  }, []);

  /** Replace the present without touching the stacks (used after a re-record
   * or once edits are baked into a fresh clip). */
  const reset = useCallback((next: EditTimeline) => {
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

  return {
    timeline: history.present,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    commit,
    reset,
    undo,
    redo,
  };
}
