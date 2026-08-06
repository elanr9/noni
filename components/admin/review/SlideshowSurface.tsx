import { StyleSheet, Text, View } from 'react-native';

import { color, radiusAdmin, type } from '../../../theme/tokens';
import { Icon } from '../../ui/Icon';
import { PressableScale } from '../../ui/PressableScale';

export interface SlideshowSurfaceProps {
  /** Slide copy, slide 1 first. */
  slides: string[];
  index: number;
  onIndex: (index: number) => void;
  /** Per-slot flag from brief_segments.screenshot_url. */
  hasScreenshot: boolean[];
}

/**
 * Admin handoff §3 — real slides in the platform box: overlay text centred
 * 800 25px/1.26, dot pager at top:62 (active dot 18px), glass 34px arrows,
 * `Screenshot` chip when the slide has one.
 */
export function SlideshowSurface({ slides, index, onIndex, hasScreenshot }: SlideshowSurfaceProps) {
  const slide = slides[index] ?? '';

  return (
    <View style={styles.fill}>
      <View style={styles.centre} pointerEvents="none">
        <Text style={styles.overlayText}>{slide}</Text>
      </View>

      <View style={styles.dots} pointerEvents="none">
        {slides.map((_, i) => (
          <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
        ))}
      </View>

      {hasScreenshot[index] === true && (
        <View style={styles.screenshotChip} pointerEvents="none">
          <Icon name="images" size={12} color={color.white} />
          <Text style={styles.screenshotText}>Screenshot</Text>
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
  screenshotChip: {
    position: 'absolute',
    top: 84,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.whiteA16,
  },
  screenshotText: {
    fontSize: type.size.micro11,
    fontWeight: type.weight.bold,
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
