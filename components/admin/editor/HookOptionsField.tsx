// Admin handoff §8 step 3 — the hook. One input, written to be spoken.
import type { JSX } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { color, radiusAdmin, shadow } from '../../../theme/tokens';

export function HookOptionsField(props: {
  value: string;
  onChange: (text: string) => void;
}): JSX.Element {
  const { value, onChange } = props;
  return (
    <View style={[styles.card, shadow.shadowCard]}>
      <TextInput
        multiline
        value={value}
        onChangeText={onChange}
        placeholder="Write your hook"
        placeholderTextColor={color.slate400}
        style={styles.field}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    borderRadius: radiusAdmin.lg,
    backgroundColor: color.white,
  },
  field: {
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 16 * 1.4,
    color: color.ink,
    padding: 0,
    minHeight: 44,
    textAlignVertical: 'top',
  },
});
