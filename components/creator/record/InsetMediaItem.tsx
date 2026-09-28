// The clip's inset picture (screenshot or recording poster) where the render
// puts it: centred at (screenshot_x, screenshot_y), screenshot_width of the
// frame wide. Hold and drag to move, pinch to resize; commits on release.
import type { JSX } from 'react';
import { Image, StyleSheet } from 'react-native';

import type { BriefSegment } from '../../../lib/briefs-api';
import type { ShotPreview } from '../SegmentOverlayPreview';
import { GestureItem } from '../slides/GestureItem';
import type { StageFrame } from './stageFrame';

/** Render defaults, mirrored from SegmentOverlayPreview / renderTimeline. */
const DEFAULT_Y = 0.62;
const DEFAULT_WIDTH = 0.85;
const MIN_WIDTH = 0.15;
const MAX_WIDTH = 0.95;

export type InsetPlacement = { x: number; y: number; width: number };

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export function insetPlacement(segment: BriefSegment): InsetPlacement {
  return {
    x: segment.screenshot_x ?? 0.5,
    y: segment.screenshot_y ?? DEFAULT_Y,
    width: clamp(segment.screenshot_width ?? DEFAULT_WIDTH, MIN_WIDTH, MAX_WIDTH),
  };
}

/** Keeps the whole card inside the frame for its size and aspect. */
function clampInside(
  place: InsetPlacement,
  aspect: number,
  frame: StageFrame,
): InsetPlacement {
  const halfW = place.width / 2;
  const halfH = (place.width * frame.width) / aspect / frame.height / 2;
  return {
    width: place.width,
    x: clamp(place.x, halfW, 1 - halfW),
    y: clamp(place.y, Math.min(halfH, 0.5), Math.max(1 - halfH, 0.5)),
  };
}

export function InsetMediaItem(props: {
  segment: BriefSegment;
  shot: ShotPreview;
  frame: StageFrame;
  editable: boolean;
  onPlace: (place: InsetPlacement) => void;
  onGestureStart?: () => void;
}): JSX.Element {
  const { segment, shot, frame, editable, onPlace, onGestureStart } = props;
  const place = insetPlacement(segment);
  const cardWidth = frame.width * place.width;
  const cardHeight = cardWidth / shot.aspect;

  return (
    <GestureItem
      x={place.x}
      y={place.y}
      stageWidth={frame.width}
      stageHeight={frame.height}
      onMove={
        editable
          ? (x, y) => onPlace(clampInside({ ...place, x, y }, shot.aspect, frame))
          : undefined
      }
      onScale={
        editable
          ? (ratio) =>
              onPlace(
                clampInside(
                  { ...place, width: clamp(place.width * ratio, MIN_WIDTH, MAX_WIDTH) },
                  shot.aspect,
                  frame,
                ),
              )
          : undefined
      }
      minScale={MIN_WIDTH / place.width}
      maxScale={MAX_WIDTH / place.width}
      onGestureStart={onGestureStart}
      style={[styles.card, { width: cardWidth, height: cardHeight }]}
    >
      <Image source={{ uri: shot.url }} style={styles.img} />
    </GestureItem>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  img: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
});
