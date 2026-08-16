// Admin handoff §8 step 4 — the plug sentence input.
import { StyleSheet, TextInput, View } from 'react-native';

import { color, radiusAdmin, shadow } from '../../../theme/tokens';

export interface CtaCardProps {
  value: string;
  onChange: (text: string) => void;
}

export function CtaCard({ value, onChange }: CtaCardProps) {
  return (
    <View style={[styles.card, shadow.shadowCard]}>
      <TextInput
        multiline
        value={value}
        onChangeText={onChange}
        placeholder="One sentence plug"
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
