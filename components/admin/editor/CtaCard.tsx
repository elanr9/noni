// Admin handoff §8 step 4 — the plug sentence card with the claim trace
// chip, and the blue note about where the sentence lands.
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { color, radiusAdmin, shadow } from '../../../theme/tokens';
import { SectionLabel } from '../shared';

export interface CtaCardProps {
  value: string;
  onChange: (text: string) => void;
  /** Approved claim the plug traces to; the chip renders only when known. */
  claimName: string | null;
}

export function CtaCard({ value, onChange, claimName }: CtaCardProps) {
  return (
    <View style={styles.block}>
      <View style={[styles.card, shadow.shadowCard]}>
        <SectionLabel>Plug</SectionLabel>
        <TextInput
          multiline
          value={value}
          onChangeText={onChange}
          placeholder="One sentence plug"
          placeholderTextColor={color.slate400}
          style={styles.field}
        />
        {claimName !== null && (
          <View style={styles.traceChip}>
            <Text style={styles.traceText} numberOfLines={1}>
              {`Traces to: ${claimName}`}
            </Text>
          </View>
        )}
      </View>
      <View style={styles.note}>
        <Text style={styles.noteText}>
          On the next step this sentence lands inside one talking point. It
          never gets its own card or clip.
        </Text>
      </View>
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
  field: {
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 16 * 1.4,
    color: color.ink,
    padding: 0,
  },
  traceChip: {
    alignSelf: 'flex-start',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.blue100,
  },
  traceText: {
    fontSize: 12,
    fontWeight: '700',
    color: color.blue700,
  },
  note: {
    padding: 14,
    borderRadius: radiusAdmin.md,
    backgroundColor: color.blue50,
  },
  noteText: {
    fontSize: 13,
    fontWeight: '400',
    lineHeight: 13 * 1.45,
    color: color.blue700,
  },
});
