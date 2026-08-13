// Admin handoff §6 — the split header. Chips come from the week pool; a
// type that drifts from plan gets an amber border and shows actual/planned.
// This is the only place drift is reported.
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { color, postTypeTone, radiusAdmin } from '../../../theme/tokens';
import { PostTypeChip } from '../shared';

export interface SplitChip {
  key: string;
  label: string;
  actual: number;
  planned: number;
}

export function SplitHeader({
  chips,
  onChipPress,
}: {
  chips: SplitChip[];
  onChipPress?: (chip: SplitChip) => void;
}) {
  if (chips.length === 0) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroll}
      contentContainerStyle={styles.row}
    >
      {chips.map((chip) => {
        let body;
        if (chip.actual === chip.planned) {
          body = <PostTypeChip typeKey={chip.key} label={chip.label} />;
        } else {
          const tone =
            chip.key in postTypeTone
              ? postTypeTone[chip.key as keyof typeof postTypeTone]
              : { bg: color.fillQuiet, fg: color.slate500 };
          body = (
            <View style={[styles.drifted, { backgroundColor: tone.bg }]}>
              <Text numberOfLines={1} style={[styles.driftedLabel, { color: tone.fg }]}>
                {chip.label}
              </Text>
              <Text style={styles.driftedCount}>
                {chip.actual}/{chip.planned}
              </Text>
            </View>
          );
        }
        if (!onChipPress) return <View key={chip.key}>{body}</View>;
        return (
          <Pressable
            key={chip.key}
            accessibilityRole="button"
            accessibilityLabel={`About ${chip.label}`}
            onPress={() => onChipPress(chip)}
          >
            {body}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  drifted: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 3.5,
    paddingHorizontal: 10,
    borderRadius: radiusAdmin.pill,
    borderWidth: 1.5,
    borderColor: color.amber,
  },
  driftedLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  driftedCount: {
    fontSize: 12,
    fontWeight: '700',
    color: color.amber,
  },
});
