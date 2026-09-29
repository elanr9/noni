// Manager edits on a submission's clips or slides: optimistic local state,
// one debounced write per key straight to brief_segments / briefs. `flush`
// runs anything still pending so a re-render never races a save; `discard`
// drops pending writes and puts every touched row back the way it was.
import { useCallback, useEffect, useRef } from 'react';

import { setBriefSubtitlesY } from '../../../lib/admin-api';
import { updateBriefSegment, type BriefSegment } from '../../../lib/briefs-api';
import type { OverlayBox } from '../../../lib/overlay-boxes';
import { segmentBoxes, segmentWithBoxes } from '../../creator/slides/segment-boxes';

const COMMIT_DELAY_MS = 400;

export type InsetDefaults = { x: number; y: number; width: number };

export type EditSnapshot = { segments: BriefSegment[]; subtitlesY: number | null };

type Pending = { handle: ReturnType<typeof setTimeout>; fire: () => void };

function settle(promises: Iterable<Promise<void>>): Promise<void> {
  return Promise.allSettled([...promises]).then(() => undefined);
}

export function useReviewEdits(params: {
  briefId: string;
  onSegments: (update: (prev: BriefSegment[]) => BriefSegment[]) => void;
  /** A save failed; `retry` queues that same write again. */
  onError: (message: string, retry: () => void) => void;
}): {
  updateBoxes: (segment: BriefSegment, update: (boxes: OverlayBox[]) => OverlayBox[]) => void;
  placeInset: (
    segment: BriefSegment,
    change: Partial<InsetDefaults>,
    defaults: InsetDefaults,
  ) => void;
  placeSubtitles: (y: number) => void;
  /** Runs every pending write now and waits for all of them. */
  flush: () => Promise<void>;
  /** Cancels pending writes and restores touched rows from the snapshot. */
  discard: (snapshot: EditSnapshot) => Promise<void>;
  isDirty: () => boolean;
} {
  const { briefId, onSegments, onError } = params;
  const timers = useRef(new Map<string, Pending>());
  const inflight = useRef(new Set<Promise<void>>());
  const dirty = useRef(false);
  const touchedSegments = useRef(new Set<string>());
  const touchedSubtitles = useRef(false);

  const schedule = useCallback(
    (key: string, run: () => Promise<void>, message: string) => {
      dirty.current = true;
      const pending = timers.current.get(key);
      if (pending) clearTimeout(pending.handle);
      const fire = () => {
        timers.current.delete(key);
        const promise: Promise<void> = run()
          .catch(() => onError(message, () => schedule(key, run, message)))
          .finally(() => inflight.current.delete(promise));
        inflight.current.add(promise);
      };
      timers.current.set(key, { handle: setTimeout(fire, COMMIT_DELAY_MS), fire });
    },
    [onError],
  );

  const flush = useCallback(async () => {
    for (const { handle, fire } of [...timers.current.values()]) {
      clearTimeout(handle);
      fire();
    }
    timers.current.clear();
    await settle(inflight.current);
  }, []);

  const discard = useCallback(
    async (snapshot: EditSnapshot) => {
      for (const { handle } of timers.current.values()) clearTimeout(handle);
      timers.current.clear();
      await settle(inflight.current);
      const restores: Promise<void>[] = [];
      for (const id of touchedSegments.current) {
        const original = snapshot.segments.find((s) => s.id === id);
        if (original === undefined) continue;
        restores.push(
          updateBriefSegment(id, {
            overlay_style: original.overlay_style,
            overlay_text: original.overlay_text,
            text_y: original.text_y,
            show_on_screen: original.show_on_screen,
            screenshot_x: original.screenshot_x,
            screenshot_y: original.screenshot_y,
            screenshot_width: original.screenshot_width,
          }),
        );
      }
      if (touchedSubtitles.current && snapshot.subtitlesY !== null) {
        restores.push(setBriefSubtitlesY(briefId, snapshot.subtitlesY));
      }
      await settle(restores);
      touchedSegments.current.clear();
      touchedSubtitles.current = false;
      dirty.current = false;
    },
    [briefId],
  );

  useEffect(() => {
    const map = timers.current;
    return () => {
      for (const { handle, fire } of [...map.values()]) {
        clearTimeout(handle);
        fire();
      }
      map.clear();
    };
  }, []);

  const updateBoxes = useCallback(
    (segment: BriefSegment, update: (boxes: OverlayBox[]) => OverlayBox[]) => {
      const next = segmentWithBoxes(segment, update(segmentBoxes(segment)));
      touchedSegments.current.add(segment.id);
      onSegments((prev) => prev.map((s) => (s.id === segment.id ? next : s)));
      schedule(
        `boxes:${segment.id}`,
        () =>
          updateBriefSegment(segment.id, {
            overlay_style: next.overlay_style,
            overlay_text: next.overlay_text,
            text_y: next.text_y,
            show_on_screen: next.show_on_screen,
          }),
        'Could not save that text.',
      );
    },
    [onSegments, schedule],
  );

  const placeInset = useCallback(
    (segment: BriefSegment, change: Partial<InsetDefaults>, defaults: InsetDefaults) => {
      const next = {
        x: change.x ?? segment.screenshot_x ?? defaults.x,
        y: change.y ?? segment.screenshot_y ?? defaults.y,
        width: change.width ?? segment.screenshot_width ?? defaults.width,
      };
      touchedSegments.current.add(segment.id);
      onSegments((prev) =>
        prev.map((s) =>
          s.id === segment.id
            ? { ...s, screenshot_x: next.x, screenshot_y: next.y, screenshot_width: next.width }
            : s,
        ),
      );
      schedule(
        `inset:${segment.id}`,
        () =>
          updateBriefSegment(segment.id, {
            screenshot_x: next.x,
            screenshot_y: next.y,
            screenshot_width: next.width,
          }),
        'Could not save that picture.',
      );
    },
    [onSegments, schedule],
  );

  const placeSubtitles = useCallback(
    (y: number) => {
      touchedSubtitles.current = true;
      schedule(
        'subtitles',
        () => setBriefSubtitlesY(briefId, y),
        'Could not save the subtitle position.',
      );
    },
    [briefId, schedule],
  );

  return {
    updateBoxes,
    placeInset,
    placeSubtitles,
    flush,
    discard,
    isDirty: () => dirty.current,
  };
}
