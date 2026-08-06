import { StyleSheet, Text, View } from 'react-native';

import { color, radiusAdmin, shadow, type } from '../../../theme/tokens';
import { PressableScale } from '../../ui/PressableScale';

export interface PostSlidesProps {
  /** One copy string per slide, in order. */
  slides: string[];
  index: number;
  onSelect: (index: number) => void;
}

/** Admin handoff §10 — post detail slideshow media at the fixed 300px box. */
export function PostSlides({ slides, index, onSelect }: PostSlidesProps) {
  return (
    <View style={[styles.canvas, shadow.shadowMedia]}>
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
  );
}

const styles = StyleSheet.create({
  canvas: {
    width: '100%',
    height: 300,
    borderRadius: radiusAdmin.xl,
    backgroundColor: color.ink900,
    alignItems: 'center',
    justifyContent: 'center',
  },
  counterChip: {
    position: 'absolute',
    top: 12,
    right: 12,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radiusAdmin.pill,
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
    fontSize: type.size.titleSm,
    lineHeight: type.size.titleSm * type.leading.snug,
    fontWeight: '800',
    letterSpacing: type.tracking.title,
    color: color.white,
    textAlign: 'center',
  },
  dots: {
    position: 'absolute',
    bottom: 14,
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
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.whiteA45,
  },
  dotActive: {
    width: 18,
    backgroundColor: color.white,
  },
});
