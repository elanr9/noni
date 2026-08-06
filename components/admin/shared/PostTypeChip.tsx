import { StyleSheet, Text } from 'react-native';

import { color, postTypeTone, radiusAdmin } from '../../../theme/tokens';

export interface PostTypeChipProps {
  /** post_types.key — unknown keys render the quiet tone. */
  typeKey: string;
  /** post_types.label, e.g. "Numbered list". */
  label: string;
}

/** Admin handoff §1 — 5×10 pill, 700 12px, nowrap, one tint per type. */
export function PostTypeChip({ typeKey, label }: PostTypeChipProps) {
  const tone =
    typeKey in postTypeTone
      ? postTypeTone[typeKey as keyof typeof postTypeTone]
      : { bg: color.fillQuiet, fg: color.slate500 };

  return (
    <Text numberOfLines={1} style={[styles.chip, { backgroundColor: tone.bg, color: tone.fg }]}>
      {label}
    </Text>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: radiusAdmin.pill,
    fontSize: 12,
    fontWeight: '700',
    overflow: 'hidden',
    alignSelf: 'flex-start',
  },
});
