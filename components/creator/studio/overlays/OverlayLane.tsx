// The overlay lane under the clip strip: one bar per overlay on the same time
// scale as the thumbnails. Overlapping overlays stack into rows.
import { memo, type JSX } from 'react';
import { StyleSheet, View } from 'react-native';

import { documentDurationMs, type Overlay, type VideoDocument } from '../../../../lib/edit-document';
import { useStudioStore } from '../../../../lib/studio-store';
import { BAR_HEIGHT, OverlayBar } from './OverlayBar';
import { useTimelineScale } from './useScale';

const ROW_GAP = 4;
const MIN_BAR_WIDTH = 16;

export type OverlayLaneProps = { doc: VideoDocument };

/** Greedy row packing so bars that overlap in time never draw on top of each other. */
function packRows(overlays: Overlay[]): Map<string, number> {
  const rowEnds: number[] = [];
  const rows = new Map<string, number>();
  for (const overlay of [...overlays].sort((a, b) => a.startMs - b.startMs)) {
    let row = rowEnds.findIndex((end) => end <= overlay.startMs);
    if (row < 0) {
      row = rowEnds.length;
      rowEnds.push(overlay.endMs);
    } else {
      rowEnds[row] = overlay.endMs;
    }
    rows.set(overlay.id, row);
  }
  return rows;
}

export const OverlayLane = memo(function OverlayLane(props: OverlayLaneProps): JSX.Element | null {
  const { doc } = props;
  const msPerPx = useTimelineScale((s) => s.msPerPx);
  const scrollOffsetMs = useTimelineScale((s) => s.scrollOffsetMs);
  const selection = useStudioStore((s) => s.selection);
  const selectedId = selection?.kind === 'overlay' ? selection.overlayId : null;
  if (doc.overlays.length === 0 || msPerPx <= 0) return null;

  const totalMs = documentDurationMs(doc);
  const rows = packRows(doc.overlays);
  const rowCount = Math.max(0, ...rows.values()) + 1;
  const height = rowCount * BAR_HEIGHT + (rowCount - 1) * ROW_GAP;

  return (
    <View style={[styles.lane, { height }]} pointerEvents="box-none">
      {doc.overlays.map((overlay) => (
        <OverlayBar
          key={overlay.id}
          overlay={overlay}
          left={(overlay.startMs - scrollOffsetMs) / msPerPx}
          width={Math.max(MIN_BAR_WIDTH, (overlay.endMs - overlay.startMs) / msPerPx)}
          top={(rows.get(overlay.id) ?? 0) * (BAR_HEIGHT + ROW_GAP)}
          msPerPx={msPerPx}
          totalMs={totalMs}
          selected={overlay.id === selectedId}
        />
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  lane: {
    width: '100%',
    overflow: 'hidden',
  },
});
