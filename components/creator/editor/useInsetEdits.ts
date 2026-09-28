// Creator placement of the inset media for the editor session: an optimistic
// per segment override saved through creatorPlaceSegment after a short
// debounce so a drag and a pinch coalesce into one write.
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { creatorPlaceSegment, type BriefSegment } from '../../../lib/briefs-api';
import { useDebouncedCommit } from '../slides/useDebouncedCommit';
import {
  DEFAULT_INSET_WIDTH,
  DEFAULT_INSET_X,
  DEFAULT_INSET_Y,
  type InsetPlacement,
} from './StageInset';

export type InsetEdits = {
  /** Effective placement of a segment's inset: the local override, else the stored one. */
  placementFor: (segment: BriefSegment) => InsetPlacement;
  update: (segment: BriefSegment, placement: InsetPlacement) => void;
};

export function useInsetEdits(params: {
  onError: (message: string) => void;
  onChange?: (segment: BriefSegment, placement: InsetPlacement) => void;
}): InsetEdits {
  const [overrides, setOverrides] = useState<Record<string, InsetPlacement>>({});
  const { schedule } = useDebouncedCommit();
  const latest = useRef(params);
  useLayoutEffect(() => {
    latest.current = params;
  });

  const update = useCallback(
    (segment: BriefSegment, placement: InsetPlacement) => {
      setOverrides((prev) => ({ ...prev, [segment.id]: placement }));
      latest.current.onChange?.(segment, placement);
      schedule(segment.id, () => {
        creatorPlaceSegment({ segmentId: segment.id, screenshot: placement }).catch(() =>
          latest.current.onError('Could not save that position. Try again.'),
        );
      });
    },
    [schedule],
  );

  const placementFor = useCallback(
    (segment: BriefSegment): InsetPlacement =>
      overrides[segment.id] ?? {
        x: segment.screenshot_x ?? DEFAULT_INSET_X,
        y: segment.screenshot_y ?? DEFAULT_INSET_Y,
        width: segment.screenshot_width ?? DEFAULT_INSET_WIDTH,
      },
    [overrides],
  );

  return useMemo(() => ({ placementFor, update }), [placementFor, update]);
}
