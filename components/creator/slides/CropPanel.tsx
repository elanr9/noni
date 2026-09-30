// Bottom sheet while the creator frames a photo on the stage: the post's
// size (one for every slide) and Done. The photo itself is moved on the
// stage, over the text that will sit on it.
import type { JSX } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { SLIDE_ASPECTS, type SlideAspect } from '../../../lib/submissions';
import { color, radius, type } from '../../../theme/tokens';
import { PressableScale } from '../../ui/PressableScale';

const ASPECT_LABEL: Record<SlideAspect, string> = {
  '4:5': 'Portrait 4:5',
  '1:1': 'Square 1:1',
  '9:16': 'Full screen 9:16',
};

export function CropPanel(props: {
  aspect: SlideAspect;
  onAspect: (aspect: SlideAspect) => void;
  onDone: () => void;
}): JSX.Element {
  const { aspect, onAspect, onDone } = props;
  return (
    <View style={styles.root}>
      <View style={styles.copy}>
        <Text style={styles.title}>Drag to move, pinch to zoom</Text>
        <Text style={styles.hint}>Every slide in this post shares one size.</Text>
      </View>
      <View style={styles.chips}>
        {SLIDE_ASPECTS.map((a) => {
          const active = a === aspect;
          return (
            <PressableScale
              key={a}
              accessibilityRole="button"
              accessibilityLabel={ASPECT_LABEL[a]}
              accessibilityState={{ selected: active }}
              onPress={() => onAspect(a)}
              style={[styles.chip, active && styles.chipOn]}
            >
              <Text style={[styles.chipText, active && styles.chipTextOn]}>{a}</Text>
            </PressableScale>
          );
        })}
      </View>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel="Done framing"
        onPress={onDone}
        style={styles.done}
      >
        <Text style={styles.doneText}>Done</Text>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: 14,
  },
  copy: {
    gap: 2,
  },
  title: {
    color: color.ink,
    fontSize: type.size.bodySm,
    fontWeight: type.weight.bold,
  },
  hint: {
    color: color.slate500,
    fontSize: type.size.bodySm,
    fontWeight: type.weight.semibold,
  },
  chips: {
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    height: 36,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: color.line,
    backgroundColor: color.white,
    justifyContent: 'center',
  },
  chipOn: {
    backgroundColor: color.ink,
    borderColor: color.ink,
  },
  chipText: {
    color: color.ink,
    fontSize: type.size.label,
    fontWeight: type.weight.bold,
  },
  chipTextOn: {
    color: color.white,
  },
  done: {
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: color.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneText: {
    color: color.white,
    fontSize: type.size.action,
    fontWeight: type.weight.heavy,
  },
});
