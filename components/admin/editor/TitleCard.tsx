// Admin handoff §8 step 1 — the title card. Optional field; the written
// title renders 700 20px display, grey "Untitled post" when unwritten.
// Fill with AI opens the fill sheet (whole post, claim → phrase → points
// → hook order); it never fires on its own.
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { color, radiusAdmin, shadow, type } from '../../../theme/tokens';
import { SectionLabel } from '../shared';
import { AiPill } from './AiPill';

export interface TitleCardProps {
  value: string;
  onChange: (text: string) => void;
  filling: boolean;
  onFillWithAi: () => void;
}

export function TitleCard({ value, onChange, filling, onFillWithAi }: TitleCardProps) {
  return (
    <View style={styles.block}>
      <View style={[styles.card, shadow.shadowCard]}>
        <View style={styles.headRow}>
          <View style={styles.labelRow}>
            <SectionLabel>Title</SectionLabel>
            <Text style={styles.optional}>Optional</Text>
          </View>
          <AiPill
            icon="sparkles"
            label="Fill with AI"
            busy={filling}
            onPress={onFillWithAi}
          />
        </View>
        <TextInput
          multiline
          value={value}
          onChangeText={onChange}
          placeholder="Untitled post"
          placeholderTextColor={color.slate400}
          style={styles.title}
        />
      </View>
      <Text style={styles.helper}>
        Skip it and the grid shows the hook instead. Fill with AI writes the
        whole post in order, from the claim down.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: 10,
  },
  card: {
    gap: 12,
    padding: 16,
    borderRadius: radiusAdmin.lg,
    backgroundColor: color.white,
  },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  optional: {
    fontSize: 12,
    fontWeight: '400',
    color: color.slate400,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 20 * 1.3,
    letterSpacing: type.tracking.title,
    color: color.ink,
    padding: 0,
  },
  helper: {
    fontSize: 13,
    fontWeight: '400',
    lineHeight: 13 * 1.45,
    color: color.slate400,
  },
});
