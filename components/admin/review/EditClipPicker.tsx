// Which clip or slide is on the stage: one pill per segment, current one lit.
import type { JSX } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';

import { color, radiusAdmin, type } from '../../../theme/tokens';
import { PressableScale } from '../../ui/PressableScale';

export function EditClipPicker(props: {
  labels: string[];
  index: number;
  onIndex: (index: number) => void;
}): JSX.Element {
  const { labels, index, onIndex } = props;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
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
