import type { JSX } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { CLASSIC_TEXT_COLOR, OVERLAY_TEXT_SPEC } from '../../../lib/overlay-boxes';
import { color } from '../../../theme/tokens';
import { OutlinedText } from '../../ui/OutlinedText';

const FONT_SIZE = 15;

/** Non interactive mock of the burned in subtitles, centred on the stage at
 * the same fraction of frame height the render uses. */
export function SubtitlePreview({
  top,
  dimmed,
}: {
  top: number;
  dimmed: boolean;
}): JSX.Element {
  return (
    <View
      pointerEvents="none"
      style={[styles.wrap, { top }, dimmed && styles.dimmed]}
    >
      <Text style={styles.label}>Subtitles</Text>
      <OutlinedText
        text={'your words show up\nright here as you talk'}
        fontSize={FONT_SIZE}
        color={CLASSIC_TEXT_COLOR}
        style={styles.line}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    transform: [{ translateY: -28 }],
  },
  dimmed: {
    opacity: 0.35,
  },
  label: {
    marginBottom: 4,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: color.whiteA45,
  },
  line: {
    lineHeight: FONT_SIZE * OVERLAY_TEXT_SPEC.condensed.lineHeight,
    textAlign: 'center',
  },
});
