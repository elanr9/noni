import type { JSX } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { CLASSIC_TEXT_COLOR, OVERLAY_TEXT_SPEC } from '../../../lib/overlay-boxes';
import { color } from '../../../theme/tokens';
import { OutlinedText } from '../../ui/OutlinedText';

/** Mirrors renderAdapter.ts subtitle geometry: 6.2 vmin, 80% of the stage width. */
const FONT_VMIN = 6.2;
const WIDTH = 0.8;

/** Non interactive mock of the burned in subtitles, centred on the stage at
 * the same fraction of frame height the render uses. */
export function SubtitlePreview({
  top,
  dimmed,
  stageWidth,
  stageHeight,
}: {
  top: number;
  dimmed: boolean;
  stageWidth: number;
  stageHeight: number;
}): JSX.Element {
  const fontSize = (Math.min(stageWidth, stageHeight) / 100) * FONT_VMIN;
  const lineHeight = fontSize * OVERLAY_TEXT_SPEC.condensed.lineHeight;
  return (
    <View
      pointerEvents="none"
      style={[
        styles.wrap,
        { top, transform: [{ translateY: -lineHeight }] },
        dimmed && styles.dimmed,
      ]}
    >
      <Text style={styles.label}>Subtitles</Text>
      <OutlinedText
        text={'your words show up\nright here as you talk'}
        fontSize={fontSize}
        color={CLASSIC_TEXT_COLOR}
        style={{ lineHeight, textAlign: 'center', maxWidth: stageWidth * WIDTH }}
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
  },
  dimmed: {
    opacity: 0.35,
  },
  label: {
    position: 'absolute',
    bottom: '100%',
    marginBottom: 4,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: color.whiteA45,
  },
});
