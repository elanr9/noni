// Everything the creator can undo in the editor: the cut timeline plus their
// text box and inset placements per segment. Placements are overrides of the
// stored segment; a segment without one shows what the server has.
import type { BriefSegment } from '../../../lib/briefs-api';
import { parseOverlayBoxes, type OverlayBox } from '../../../lib/overlay-boxes';
import type { EditTimeline } from '../../../lib/video-edit';
import {
  DEFAULT_INSET_WIDTH,
  DEFAULT_INSET_X,
  DEFAULT_INSET_Y,
  type InsetPlacement,
} from './StageInset';

export type EditorDoc = {
  timeline: EditTimeline;
  boxes: Record<string, OverlayBox[]>;
  insets: Record<string, InsetPlacement>;
};

export function initialDoc(timeline: EditTimeline): EditorDoc {
  return { timeline, boxes: {}, insets: {} };
}

export function docBoxes(
  doc: EditorDoc,
  segment: BriefSegment | null,
  overlayEnabled: boolean,
): OverlayBox[] {
  if (segment === null || !overlayEnabled) return [];
  const override = doc.boxes[segment.id];
  if (override) return override;
  if (!segment.show_on_screen) return [];
  return parseOverlayBoxes(segment.overlay_style, {
    text: segment.overlay_text,
    textY: segment.text_y,
  });
}

export function docInset(doc: EditorDoc, segment: BriefSegment): InsetPlacement {
  return (
    doc.insets[segment.id] ?? {
      x: segment.screenshot_x ?? DEFAULT_INSET_X,
      y: segment.screenshot_y ?? DEFAULT_INSET_Y,
      width: segment.screenshot_width ?? DEFAULT_INSET_WIDTH,
    }
  );
}

export function withTimeline(doc: EditorDoc, timeline: EditTimeline): EditorDoc {
  return timeline === doc.timeline ? doc : { ...doc, timeline };
}

export function withBoxes(doc: EditorDoc, segmentId: string, boxes: OverlayBox[]): EditorDoc {
  return { ...doc, boxes: { ...doc.boxes, [segmentId]: boxes } };
}

export function withInset(doc: EditorDoc, segmentId: string, inset: InsetPlacement): EditorDoc {
  return { ...doc, insets: { ...doc.insets, [segmentId]: inset } };
}

/** Recolour every overridden box set, seeding the clip in view from its current boxes. */
export function withBoxesRestyled(
  doc: EditorDoc,
  color: string,
  bg: boolean,
  current: { segmentId: string; boxes: OverlayBox[] },
): EditorDoc {
  const restyle = (boxes: OverlayBox[]) => boxes.map((b) => ({ ...b, color, bg }));
  const boxes: Record<string, OverlayBox[]> = {};
  for (const [id, set] of Object.entries(doc.boxes)) boxes[id] = restyle(set);
  boxes[current.segmentId] = restyle(doc.boxes[current.segmentId] ?? current.boxes);
  return { ...doc, boxes };
}
