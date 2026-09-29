// Manager edits on a submission's clips or slides: optimistic local state,
// one debounced write per key straight to brief_segments / briefs. `flush`
// runs anything still pending so a re-render never races a save.
import { useCallback, useEffect, useRef } from 'react';

import { setBriefSubtitlesY } from '../../../lib/admin-api';
import { updateBriefSegment, type BriefSegment } from '../../../lib/briefs-api';
import type { OverlayBox } from '../../../lib/overlay-boxes';
import { segmentBoxes, segmentWithBoxes } from '../../creator/slides/segment-boxes';

const COMMIT_DELAY_MS = 400;

export type InsetDefaults = { x: number; y: number; width: number };

type Pending = { handle: ReturnType<typeof setTimeout>; fire: () => void };

export function useReviewEdits(params: {
  briefId: string;
  onSegments: (update: (prev: BriefSegment[]) => BriefSegment[]) => void;
  onError: (message: string) => void;
}): {
  updateBoxes: (segment: BriefSegment, update: (boxes: OverlayBox[]) => OverlayBox[]) => void;
  placeInset: (
    segment: BriefSegment,
    change: Partial<InsetDefaults>,
    defaults: InsetDefaults,
  ) => void;
  placeSubtitles: (y: number) => void;
  flush: () => Promise<void>;
  isDirty: () => boolean;
} {
  const { briefId, onSegments, onError } = params;
  const timers = useRef(new Map<string, Pending>());
  const inflight = useRef(new Set<Promise<void>>());
  const dirty = useRef(false);

  const schedule = useCallback((key: string, run: () => Promise<void>) => {
    dirty.current = true;
    const pending = timers.current.get(key);
    if (pending) clearTimeout(pending.handle);
    const fire = () => {
      timers.current.delete(key);
      const promise: Promise<void> = run().finally(() => inflight.current.delete(promise));
      inflight.current.add(promise);
    };
    timers.current.set(key, { handle: setTimeout(fire, COMMIT_DELAY_MS), fire });
  }, []);

  const flush = useCallback(async () => {
    for (const { handle, fire } of [...timers.current.values()]) {
      clearTimeout(handle);
      fire();
    }
    timers.current.clear();
    await Promise.allSettled([...inflight.current]);
  }, []);

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
      onSegments((prev) => prev.map((s) => (s.id === segment.id ? next : s)));
      schedule(`boxes:${segment.id}`, () =>
        updateBriefSegment(segment.id, {
          overlay_style: next.overlay_style,
          overlay_text: next.overlay_text,
          text_y: next.text_y,
          show_on_screen: next.show_on_screen,
        }).catch(() => onError('Could not save that text. Try again.')),
      );
    },
    [onSegments, onError, schedule],
  );

  const placeInset = useCallback(
    (segment: BriefSegment, change: Partial<InsetDefaults>, defaults: InsetDefaults) => {
      const next = {
        x: change.x ?? segment.screenshot_x ?? defaults.x,
        y: change.y ?? segment.screenshot_y ?? defaults.y,
        width: change.width ?? segment.screenshot_width ?? defaults.width,
      };
      onSegments((prev) =>
        prev.map((s) =>
          s.id === segment.id
            ? { ...s, screenshot_x: next.x, screenshot_y: next.y, screenshot_width: next.width }
            : s,
        ),
      );
      schedule(`inset:${segment.id}`, () =>
        updateBriefSegment(segment.id, {
          screenshot_x: next.x,
          screenshot_y: next.y,
          screenshot_width: next.width,
        }).catch(() => onError('Could not save that picture. Try again.')),
      );
    },
    [onSegments, onError, schedule],
  );

  const placeSubtitles = useCallback(
    (y: number) => {
      schedule('subtitles', () =>
        setBriefSubtitlesY(briefId, y).catch(() =>
          onError('Could not save the subtitle position. Try again.'),
        ),
      );
    },
    [briefId, onError, schedule],
  );

  return {
    updateBoxes,
    placeInset,
    placeSubtitles,
    flush,
    isDirty: () => dirty.current,
  };
}
