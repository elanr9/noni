// Which clip or slide is on the stage: one pill per segment, the current one
// lit and scrolled to the centre.
import { useEffect, useRef, useState, type JSX } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';

import { color, radiusAdmin, type } from '../../../theme/tokens';
import { PressableScale } from '../../ui/PressableScale';

type PillFrame = { x: number; width: number };

export function EditClipPicker(props: {
  labels: string[];
  index: number;
  onIndex: (index: number) => void;
}): JSX.Element {
  const { labels, index, onIndex } = props;
  const scroll = useRef<ScrollView>(null);
  const frames = useRef(new Map<number, PillFrame>());
  const [viewport, setViewport] = useState(0);

  useEffect(() => {
    const frame = frames.current.get(index);
    if (frame === undefined || viewport <= 0) return;
    const x = Math.max(0, frame.x + frame.width / 2 - viewport / 2);
    scroll.current?.scrollTo({ x, animated: true });
  }, [index, viewport, labels.length]);

  return (
    <ScrollView
      ref={scroll}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      onLayout={(e) => setViewport(e.nativeEvent.layout.width)}
    >
      {labels.map((label, i) => {
        const on = i === index;
        return (
          <PressableScale
            key={`${label}-${i}`}
            accessibilityRole="button"
            accessibilityLabel={`Edit ${label}`}
            accessibilityState={{ selected: on }}
            onPress={() => onIndex(i)}
            onLayout={(e) => {
              const { x, width } = e.nativeEvent.layout;
              frames.current.set(i, { x, width });
            }}
            style={[styles.pill, on && styles.pillOn]}
          >
            <Text style={[styles.text, on && styles.textOn]}>{label}</Text>
          </PressableScale>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 20,
  },
  pill: {
    height: 30,
    paddingHorizontal: 12,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.whiteA16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillOn: {
    backgroundColor: color.white,
  },
  text: {
    fontSize: type.size.label,
    fontWeight: type.weight.bold,
    color: color.white,
  },
  textOn: {
    color: color.ink,
  },
});
