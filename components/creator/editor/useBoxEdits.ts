// Creator text box edits for the editor session: an optimistic per segment
// override of the box set, saved whole through creatorEditSegmentBoxes after
// a short debounce so a drag, a pinch and a retype coalesce into one write.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { creatorEditSegmentBoxes, type BriefSegment } from '../../../lib/briefs-api';
import { parseOverlayBoxes, type OverlayBox } from '../../../lib/overlay-boxes';

const SAVE_DEBOUNCE_MS = 400;

export type BoxEdits = {
  /** Effective boxes of a segment: the local override, else the stored set. */
  boxesFor: (segment: BriefSegment | null, overlayEnabled: boolean) => OverlayBox[];
  update: (segment: BriefSegment, boxes: OverlayBox[]) => void;
  /** Recolour every overridden box locally (plus the clip in view, seeded
   * from its current boxes); the parent persists the post wide restyle. */
  restyleAll: (
    color: string,
    bg: boolean,
    current: { segment: BriefSegment; boxes: OverlayBox[] },
  ) => void;
  /** Write every pending change now. */
  flush: () => void;
};

export function useBoxEdits(params: {
  onError: (message: string) => void;
  onChange?: (segment: BriefSegment, boxes: OverlayBox[]) => void;
}): BoxEdits {
  const [overrides, setOverrides] = useState<Record<string, OverlayBox[]>>({});
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const pending = useRef(new Map<string, OverlayBox[]>());
  const latest = useRef(params);
  useLayoutEffect(() => {
    latest.current = params;
  });

  const save = useCallback((segmentId: string) => {
    timers.current.delete(segmentId);
    const boxes = pending.current.get(segmentId);
    if (!boxes) return;
    pending.current.delete(segmentId);
    creatorEditSegmentBoxes({ segmentId, boxes }).catch(() =>
      latest.current.onError('Could not save that text. Try again.'),
    );
  }, []);

  const flush = useCallback(() => {
    timers.current.forEach((timer) => clearTimeout(timer));
    timers.current.clear();
    Array.from(pending.current.keys()).forEach(save);
  }, [save]);

  useEffect(() => flush, [flush]);

  const update = useCallback(
    (segment: BriefSegment, boxes: OverlayBox[]) => {
      setOverrides((prev) => ({ ...prev, [segment.id]: boxes }));
      latest.current.onChange?.(segment, boxes);
      pending.current.set(segment.id, boxes);
      const existing = timers.current.get(segment.id);
      if (existing) clearTimeout(existing);
      timers.current.set(
        segment.id,
        setTimeout(() => save(segment.id), SAVE_DEBOUNCE_MS),
      );
    },
    [save],
  );

  const restyleAll = useCallback(
    (color: string, bg: boolean, current: { segment: BriefSegment; boxes: OverlayBox[] }) => {
      const restyle = (boxes: OverlayBox[]) => boxes.map((b) => ({ ...b, color, bg }));
      setOverrides((prev) => ({
        ...Object.fromEntries(
          Object.entries(prev).map(([id, boxes]) => [id, restyle(boxes)]),
        ),
        [current.segment.id]: restyle(prev[current.segment.id] ?? current.boxes),
      }));
      pending.current.forEach((boxes, id) => pending.current.set(id, restyle(boxes)));
    },
    [],
  );

  const boxesFor = useCallback(
    (segment: BriefSegment | null, overlayEnabled: boolean): OverlayBox[] => {
      if (segment === null || !overlayEnabled) return [];
      const override = overrides[segment.id];
      if (override) return override;
      if (!segment.show_on_screen) return [];
      return parseOverlayBoxes(segment.overlay_style, {
        text: segment.overlay_text,
        textY: segment.text_y,
      });
    },
    [overrides],
  );

  return useMemo(
    () => ({ boxesFor, update, restyleAll, flush }),
    [boxesFor, update, restyleAll, flush],
  );
}
