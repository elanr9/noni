// Admin handoff §8 step 1 — the title card. Optional field; the written
// title renders 700 20px display, grey "Untitled post" when unwritten.
import { StyleSheet, TextInput, View } from 'react-native';

import { color, radiusAdmin, shadow, type } from '../../../theme/tokens';

export interface TitleCardProps {
  value: string;
  onChange: (text: string) => void;
}

export function TitleCard({ value, onChange }: TitleCardProps) {
  return (
    <View style={[styles.card, shadow.shadowCard]}>
      <TextInput
        multiline
        value={value}
        onChangeText={onChange}
        placeholder="Untitled post"
        placeholderTextColor={color.slate400}
        style={styles.title}
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
  title: {
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 20 * 1.3,
    letterSpacing: type.tracking.title,
    color: color.ink,
    padding: 0,
  },
});
