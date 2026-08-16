// Admin handoff §8 step 2 — the search phrase card. The TikTok search
// this post answers, 600 17px with a search glyph; Regenerate is a tap on
// the existing call. "Also searched" alternates swap into the field.
import { ChevronRight, Search } from 'lucide-react-native';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { color, radiusAdmin, shadow } from '../../../theme/tokens';
import { PressableScale } from '../../ui/PressableScale';
import { SectionLabel } from '../shared';
import { AiPill } from './AiPill';

export interface SearchPhraseCardProps {
  value: string;
  onChange: (text: string) => void;
  busy: boolean;
  onRegenerate: () => void;
  /** Alternate searches; the section renders only when some exist. */
  alternates: string[];
  onPickAlternate: (phrase: string) => void;
}

export function SearchPhraseCard({
  value,
  onChange,
  busy,
  onRegenerate,
  alternates,
  onPickAlternate,
}: SearchPhraseCardProps) {
  return (
    <View style={styles.block}>
      <View style={[styles.card, shadow.shadowCard]}>
        <View style={styles.headRow}>
          <AiPill
            icon="rotate-ccw"
            label="Regenerate"
            busy={busy}
            onPress={onRegenerate}
          />
        </View>
        <View style={styles.fieldRow}>
          <Search size={16} color={color.slate400} strokeWidth={2} />
          <TextInput
            multiline
            value={value}
            onChangeText={onChange}
            placeholder="What would they type into TikTok?"
            placeholderTextColor={color.slate400}
            autoCapitalize="none"
            style={styles.field}
          />
        </View>
      </View>

      {alternates.length > 0 && (
        <View style={styles.alsoBlock}>
          <SectionLabel>Also searched</SectionLabel>
          {alternates.map((phrase) => (
            <PressableScale
              key={phrase}
              accessibilityRole="button"
              accessibilityLabel={phrase}
              onPress={() => onPickAlternate(phrase)}
              style={[styles.alsoRow, shadow.shadowCard]}
            >
              <Search size={13} color={color.slate400} strokeWidth={2} />
              <Text style={styles.alsoText} numberOfLines={1}>
                {phrase}
              </Text>
              <ChevronRight size={15} color={color.slate300} strokeWidth={2} />
            </PressableScale>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: 14,
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
    justifyContent: 'flex-end',
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  field: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    lineHeight: 17 * 1.35,
    color: color.ink,
    padding: 0,
    marginTop: -1,
  },
  alsoBlock: {
    gap: 8,
  },
  alsoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: radiusAdmin.md,
    backgroundColor: color.white,
  },
  alsoText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: color.slate500,
  },
});
