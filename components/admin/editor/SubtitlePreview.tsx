import type { JSX } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { color } from '../../../theme/tokens';

const SUBTITLE_FONT = 'TikTokSans_700Bold';

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
      <View style={styles.block}>
        <Text style={styles.line}>your words show up</Text>
        <Text style={styles.line}>right here as you talk</Text>
      </View>
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
  block: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
  },
  line: {
    fontFamily: SUBTITLE_FONT,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 19,
    color: color.white,
    textAlign: 'center',
  },
});
