import { StyleSheet, Text, View } from 'react-native';

import type { LibrarySource } from '../../../lib/library-api';
import { color, radiusAdmin, shadow, type } from '../../../theme/tokens';
import { PressableScale } from '../../ui/PressableScale';

/** The tab's lanes: three library sources plus the shared media grid. */
export type LibraryLane = Exclude<LibrarySource, 'from_creator'> | 'media';

const CHIPS: { lane: LibraryLane; label: string }[] = [
  { lane: 'idea', label: 'Ideas' },
  { lane: 'reference', label: 'References' },
  { lane: 'media', label: 'Media' },
  { lane: 'our_post', label: 'Our posts' },
];

export interface SourceChipsProps {
  value: LibraryLane;
  onChange: (lane: LibraryLane) => void;
}

/** Segmented lane switcher: grey track, the active lane lifts as a white pill. */
export function SourceChips({ value, onChange }: SourceChipsProps) {
  return (
    <View style={styles.track}>
      {CHIPS.map((chip) => {
        const active = chip.lane === value;
        return (
          <PressableScale
            key={chip.lane}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(chip.lane)}
            style={[styles.chip, active && styles.chipActive, active && shadow.shadowCard]}
          >
            <Text style={[styles.text, active && styles.textActive]} numberOfLines={1}>
              {chip.label}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.fillQuiet,
  },
  chip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: radiusAdmin.pill,
  },
  chipActive: {
    backgroundColor: color.white,
  },
  text: {
    fontSize: type.size.label,
    fontWeight: '700',
    color: color.slate500,
  },
  textActive: {
    color: color.ink,
  },
});
