import { useMemo, useRef } from 'react';
import { PanResponder, StyleSheet, Text, View } from 'react-native';

import type { OverlayBox } from '../../../lib/overlay-boxes';
import { color, radiusAdmin, type } from '../../../theme/tokens';
import { SlideStage, type SlideInset } from '../../SlideStage';
import { Icon } from '../../ui/Icon';
import { PressableScale } from '../../ui/PressableScale';

export type SlideshowSurfaceSlide = {
  /** The creator's submitted photo (final baked file once render is ready). */
  photoUri?: string;
  /** Composited client-side only while the bake is still running. */
  boxes: OverlayBox[];
  inset?: SlideInset;
  /** Legacy centered fallback when a slide has no boxes. */
  text: string;
};

export interface SlideshowSurfaceProps {
  slides: SlideshowSurfaceSlide[];
  index: number;
  onIndex: (index: number) => void;
}

/**
 * The real post in photo mode: the creator's photos with the admin's text and
 * pictures on them, `n / total` pill under the top bar, glass 34px arrows.
 * Pager dots live in ReviewMetaOverlay, between the photo and the caption.
 */
/** Horizontal travel that counts as a page swipe. */
const SWIPE_DISTANCE = 40;

export function SlideshowSurface({ slides, index, onIndex }: SlideshowSurfaceProps) {
  const slide = slides[index];
  const latest = useRef({ index, count: slides.length, onIndex });
  latest.current = { index, count: slides.length, onIndex };

  const swipe = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) =>
          Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
        onPanResponderRelease: (_e, g) => {
          const { index: i, count, onIndex: go } = latest.current;
          if (g.dx <= -SWIPE_DISTANCE && i < count - 1) go(i + 1);
          else if (g.dx >= SWIPE_DISTANCE && i > 0) go(i - 1);
        },
      }),
    [],
  );

  return (
    <View style={styles.fill} {...swipe.panHandlers}>
      {slide !== undefined ? (
        <SlideStage
          boxes={slide.boxes}
          photoUri={slide.photoUri}
          inset={slide.inset}
          tint={color.ink800}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      {slide !== undefined &&
      slide.boxes.length === 0 &&
      slide.photoUri === undefined &&
      slide.text.length > 0 ? (
        <View style={styles.centre} pointerEvents="none">
          <Text style={styles.overlayText}>{slide.text}</Text>
        </View>
      ) : null}

      {slides.length > 1 && (
        <View style={styles.counter} pointerEvents="none">
          <Text style={styles.counterText}>{`${index + 1} / ${slides.length}`}</Text>
        </View>
      )}

      {index > 0 && (
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Previous slide"
          onPress={() => onIndex(index - 1)}
          style={[styles.arrow, styles.arrowLeft]}
        >
          <Icon name="chevron-left" size={18} color={color.white} />
        </PressableScale>
      )}
      {index < slides.length - 1 && (
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Next slide"
          onPress={() => onIndex(index + 1)}
          style={[styles.arrow, styles.arrowRight]}
        >
          <Icon name="chevron-right" size={18} color={color.white} />
        </PressableScale>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    backgroundColor: color.ink800,
  },
  centre: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
  },
  overlayText: {
    fontSize: 25,
    lineHeight: 25 * 1.26,
    fontWeight: type.weight.heavy,
    letterSpacing: type.tracking.title,
    color: color.white,
    textAlign: 'center',
  },
  counter: {
    position: 'absolute',
    top: 112,
    right: 14,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: radiusAdmin.pill,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  counterText: {
    fontSize: type.size.label,
    fontWeight: type.weight.semibold,
    color: color.white,
  },
  arrow: {
    position: 'absolute',
    top: '50%',
    marginTop: -17,
    width: 34,
    height: 34,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.whiteA16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowLeft: {
    left: 14,
  },
  arrowRight: {
    right: 14,
  },
});
