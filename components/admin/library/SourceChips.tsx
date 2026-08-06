import { StyleSheet, Text, View } from 'react-native';

import type { LibrarySource } from '../../../lib/library-api';
import { borderWidth, color, radiusAdmin, type } from '../../../theme/tokens';
import { PressableScale } from '../../ui/PressableScale';

const CHIPS: Array<{ source: LibrarySource; label: string }> = [
  { source: 'idea', label: 'Ideas' },
  { source: 'our_post', label: 'Our posts' },
  { source: 'reference', label: 'References' },
  { source: 'from_creator', label: 'From creator' },
];

export interface SourceChipsProps {
  value: LibrarySource;
  onChange: (source: LibrarySource) => void;
}

/** Admin handoff §9 — the four source chips, active solid blue-500 with white text. */
export function SourceChips({ value, onChange }: SourceChipsProps) {
  return (
    <View style={styles.row}>
      {CHIPS.map((chip) => {
        const active = chip.source === value;
        return (
          <PressableScale
            key={chip.source}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(chip.source)}
            style={[styles.chip, active && styles.chipActive]}
          >
            <Text style={[styles.text, active && styles.textActive]}>
              {chip.label}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 6,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.white,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
  },
  chipActive: {
    backgroundColor: color.blue500,
    borderColor: color.blue500,
  },
  text: {
    fontSize: type.size.label,
    fontWeight: '700',
    color: color.slate500,
  },
  textActive: {
    color: color.white,
  },
});
