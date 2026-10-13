// Progress dots for the slide flow: current is a 20pt bar, slides with a
// photo are green, the rest quiet. From SSCreator.jsx Dots.
import type { JSX } from 'react';
import { StyleSheet, View } from 'react-native';

import { briefTone, color } from '../../../../theme/tokens';
import type { CreatorSlide } from '../model';

export function SlideDots({ slides, index, dark = false }: { slides: CreatorSlide[]; index: number; dark?: boolean }): JSX.Element {
  return (
    <View style={styles.row}>
      {slides.map((s, k) => (
        <View
          key={s.id}
          style={[
            styles.dot,
            {
              width: k === index ? 20 : 7,
              backgroundColor:
                k === index ? (dark ? color.white : color.ink) : s.photo ? briefTone.done : dark ? color.whiteA28 : color.lineStrong,
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 5, justifyContent: 'center' },
  dot: { height: 7, borderRadius: 99 },
});
