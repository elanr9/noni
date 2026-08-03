import { StyleSheet, Text, View } from 'react-native';

import { color, radius, type } from '../../theme/tokens';

export interface FormatPillProps {
  format: 'video' | 'photo_carousel';
  /** Calendar cells: 3/7 padding, 10/700. */
  compact?: boolean;
  /** On-media pill (README §4.3 / §5.1): white-92 bg, ink 10/700, 4/7 padding. */
  overlay?: boolean;
}

export function FormatPill({ format, compact = false, overlay = false }: FormatPillProps) {
  return (
    <View style={[styles.pill, compact && styles.pillCompact, overlay && styles.pillOverlay]}>
      <Text
        numberOfLines={1}
        style={[styles.text, compact && styles.textCompact, overlay && styles.textOverlay]}
      >
        {format === 'photo_carousel' ? 'Slideshow' : 'Reel'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: radius.pill,
    backgroundColor: color.fillQuiet,
  },
  pillCompact: {
    paddingVertical: 3,
    paddingHorizontal: 7,
  },
  pillOverlay: {
    paddingVertical: 4,
    paddingHorizontal: 7,
    backgroundColor: color.whiteA92,
  },
  text: {
    fontSize: type.size.micro11,
    fontWeight: '700',
    color: color.slate500,
  },
  textCompact: {
    fontSize: type.size.micro,
  },
  textOverlay: {
    fontSize: type.size.micro,
    color: color.ink,
  },
});
