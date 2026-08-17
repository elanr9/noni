import { StyleSheet, Text, View } from 'react-native';

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
 * Admin handoff §3 — the real post in the platform box: the creator's photos
 * with the admin's text and pictures on them, dot pager at top:62 (active dot
 * 18px), glass 34px arrows.
 */
export function SlideshowSurface({ slides, index, onIndex }: SlideshowSurfaceProps) {
  const slide = slides[index];

  return (
    <View style={styles.fill}>
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

      <View style={styles.dots} pointerEvents="none">
        {slides.map((_, i) => (
          <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
        ))}
      </View>

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
    ...StyleSheet.absoluteFillObject,
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
  dots: {
    position: 'absolute',
    top: 62,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 5,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.whiteA45,
  },
  dotActive: {
    width: 18,
    backgroundColor: color.white,
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
