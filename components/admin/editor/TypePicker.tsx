import type { JSX } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { PostType } from '../../../lib/briefs-api';
import { color, radius, type } from '../../../theme/tokens';
import { PressableScale } from '../../ui/PressableScale';

/**
 * The week split is a pool, not a lock: any post stays retypeable here and
 * the grid header shows the drift. Clip count derives from the type.
 */
export function TypePicker(props: {
  postTypes: PostType[];
  selectedId: string | null;
  onSelect: (postType: PostType) => void;
}): JSX.Element {
  const { postTypes, selectedId, onSelect } = props;
  const families: { key: 'video' | 'photo_carousel'; label: string }[] = [
    { key: 'video', label: 'Video' },
    { key: 'photo_carousel', label: 'Slideshow' },
  ];

  return (
    <View style={styles.section}>
      <Text style={styles.label}>Post type</Text>
      {families.map((family) => (
        <View key={family.key} style={styles.familyBlock}>
          <Text style={styles.familyLabel}>{family.label}</Text>
          <View style={styles.chipRow}>
            {postTypes
              .filter((t) => t.family === family.key)
              .map((t) => {
                const selected = t.id === selectedId;
                return (
                  <PressableScale
                    key={t.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => onSelect(t)}
                    style={[styles.chip, selected && styles.chipOn]}
                  >
                    <Text
                      style={[styles.chipText, selected && styles.chipTextOn]}
                    >
                      {t.label}
                    </Text>
                  </PressableScale>
                );
              })}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 8, marginBottom: 16 },
  label: {
    fontSize: type.size.label,
    fontWeight: '800',
    color: color.slate400,
    letterSpacing: type.tracking.label,
    textTransform: 'uppercase',
  },
  familyBlock: { gap: 6 },
  familyLabel: {
    fontSize: type.size.micro,
    fontWeight: '700',
    color: color.slate400,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: color.fillQuiet,
  },
  chipOn: { backgroundColor: color.blue100 },
  chipText: {
    fontSize: type.size.meta,
    fontWeight: '700',
    color: color.slate500,
  },
  chipTextOn: { color: color.blue700 },
});
