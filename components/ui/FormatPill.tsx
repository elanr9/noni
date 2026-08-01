import { StyleSheet, Text, View } from 'react-native';

import { color, radius, type } from '../../theme/tokens';

export interface FormatPillProps {
  format: 'video' | 'photo_carousel';
  /** Calendar cells: 3/7 padding, 10/700. */
  compact?: boolean;
}

export function FormatPill({ format, compact = false }: FormatPillProps) {
  return (
    <View style={[styles.pill, compact && styles.pillCompact]}>
      <Text numberOfLines={1} style={[styles.text, compact && styles.textCompact]}>
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
  text: {
    fontSize: 11,
    fontWeight: '700',
    color: color.slate500,
  },
  textCompact: {
    fontSize: type.size.micro,
  },
});
