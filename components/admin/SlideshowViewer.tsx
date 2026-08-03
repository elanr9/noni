import { StyleSheet, Text, View } from 'react-native';

import { color, radius, shadow, type } from '../../theme/tokens';
import { FormatPill } from '../ui/FormatPill';
import { PressableScale } from '../ui/PressableScale';

export interface SlideshowViewerProps {
  /** One copy string per slide, in order. */
  slides: string[];
  index: number;
  onSelect: (index: number) => void;
}

/** Slideshow media + thumb strip for Review 1g (README §5.3). No video chrome. */
export function SlideshowViewer({ slides, index, onSelect }: SlideshowViewerProps) {
  return (
    <View style={styles.wrap}>
      <View style={[styles.canvas, shadow.shadowMedia]}>
        <View style={styles.formatPill}>
          <FormatPill format="photo_carousel" overlay />
        </View>
        <View style={styles.counterChip}>
          <Text style={styles.counterText}>{`Slide ${index + 1} of ${slides.length}`}</Text>
        </View>
        <View pointerEvents="none" style={styles.copyBox}>
          <Text style={styles.copy}>{slides[index]}</Text>
        </View>
        <View style={styles.dots}>
          {slides.map((_, i) => (
            <PressableScale
              key={i}
              accessibilityRole="button"
              accessibilityLabel={`Slide ${i + 1}`}
              onPress={() => onSelect(i)}
              hitSlop={{ top: 19, bottom: 19, left: 3, right: 3 }}
              style={[styles.dot, i === index && styles.dotActive]}
            />
          ))}
        </View>
      </View>

      <View style={styles.thumbStrip}>
        {slides.map((_, i) => {
          const selected = i === index;
          return (
            <PressableScale
              key={i}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => onSelect(i)}
              style={[styles.thumb, selected && styles.thumbSelected]}
            >
              <Text style={[styles.thumbText, selected && styles.thumbTextSelected]}>
                {i + 1}
              </Text>
            </PressableScale>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 14,
  },
  canvas: {
    width: '100%',
    aspectRatio: 9 / 11,
    borderRadius: radius.xl,
    backgroundColor: color.ink900,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formatPill: {
    position: 'absolute',
    top: 12,
    left: 12,
  },
  counterChip: {
    position: 'absolute',
    top: 12,
    right: 12,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: color.whiteA16,
  },
  counterText: {
    fontSize: type.size.label,
    fontWeight: '700',
    color: color.white,
  },
  copyBox: {
    paddingHorizontal: 24,
  },
  copy: {
    fontSize: 30,
    lineHeight: 35,
    fontWeight: '800',
    letterSpacing: -0.5,
    color: color.white,
    textAlign: 'center',
  },
  dots: {
    position: 'absolute',
    bottom: 16,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: radius.pill,
    backgroundColor: color.whiteA45,
  },
  dotActive: {
    width: 22,
    backgroundColor: color.white,
  },
  thumbStrip: {
    flexDirection: 'row',
    gap: 8,
  },
  thumb: {
    flex: 1,
    height: 52,
    borderRadius: 10,
    backgroundColor: color.fillQuiet,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbSelected: {
    backgroundColor: color.blue100,
    borderWidth: 2,
    borderColor: color.blue500,
  },
  thumbText: {
    fontSize: type.size.chip,
    fontWeight: '700',
    color: color.slate400,
  },
  thumbTextSelected: {
    color: color.blue700,
  },
});
