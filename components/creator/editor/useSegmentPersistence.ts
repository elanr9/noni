// Saves the creator's per segment placements whenever the committed document
// changes (edits, undo and redo alike): text box sets through
// creatorEditSegmentBoxes, the inset through creatorPlaceSegment. Writes are
// debounced per segment and flushed on unmount or on demand.
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';

import {
  creatorEditSegmentBoxes,
  creatorPlaceSegment,
  type BriefSegment,
} from '../../../lib/briefs-api';
import type { OverlayBox } from '../../../lib/overlay-boxes';
import type { EditorDoc } from './editorDoc';
import type { InsetPlacement } from './StageInset';

const SAVE_DEBOUNCE_MS = 400;

type Pending = { handle: ReturnType<typeof setTimeout>; run: () => void };

/** Who writes a segment's boxes and inset; creators go through their RPCs. */
export type SegmentWriter = {
  boxes: (segmentId: string, boxes: OverlayBox[]) => Promise<void>;
  inset: (segmentId: string, placement: InsetPlacement) => Promise<void>;
};

export const CREATOR_SEGMENT_WRITER: SegmentWriter = {
  boxes: (segmentId, boxes) => creatorEditSegmentBoxes({ segmentId, boxes }),
  inset: (segmentId, screenshot) => creatorPlaceSegment({ segmentId, screenshot }),
};

export function useSegmentPersistence(params: {
  doc: EditorDoc;
  segments: Map<string, BriefSegment>;
  onError: (message: string) => void;
  onBoxesChange?: (segment: BriefSegment, boxes: OverlayBox[]) => void;
  onPlaceInset?: (segment: BriefSegment, placement: InsetPlacement) => void;
  writer?: SegmentWriter;
}): { flush: () => void } {
  const { doc } = params;
  const latest = useRef(params);
  useLayoutEffect(() => {
    latest.current = params;
  });
  const saved = useRef<{ boxes: EditorDoc['boxes']; insets: EditorDoc['insets'] }>({
    boxes: doc.boxes,
    insets: doc.insets,
  });
  const timers = useRef(new Map<string, Pending>());

  const schedule = useCallback((key: string, run: () => void) => {
    const pending = timers.current.get(key);
    if (pending) clearTimeout(pending.handle);
    const handle = setTimeout(() => {
      timers.current.delete(key);
      run();
    }, SAVE_DEBOUNCE_MS);
    timers.current.set(key, { handle, run });
  }, []);

  const flush = useCallback(() => {
    const map = timers.current;
    for (const { handle, run } of map.values()) {
      clearTimeout(handle);
      run();
    }
    map.clear();
  }, []);

  useEffect(() => flush, [flush]);

  useEffect(() => {
    const { segments, onError, onBoxesChange, onPlaceInset } = latest.current;
    const writer = latest.current.writer ?? CREATOR_SEGMENT_WRITER;
    const prev = saved.current;
    saved.current = { boxes: doc.boxes, insets: doc.insets };

    for (const [segmentId, boxes] of Object.entries(doc.boxes)) {
      if (prev.boxes[segmentId] === boxes) continue;
      const segment = segments.get(segmentId);
      if (!segment) continue;
      onBoxesChange?.(segment, boxes);
      schedule(`boxes:${segmentId}`, () => {
        writer.boxes(segmentId, boxes).catch(() =>
          onError('Could not save that text. Try again.'),
        );
      });
    }
    for (const [segmentId, placement] of Object.entries(doc.insets)) {
      if (prev.insets[segmentId] === placement) continue;
      const segment = segments.get(segmentId);
      if (!segment) continue;
      onPlaceInset?.(segment, placement);
      schedule(`inset:${segmentId}`, () => {
        writer.inset(segmentId, placement).catch(() =>
          onError('Could not save that position. Try again.'),
        );
      });
    }
  }, [doc.boxes, doc.insets, schedule]);

  return { flush };
}
