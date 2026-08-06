import { StyleSheet, Text, TextInput, View } from 'react-native';

import { borderWidth, color, radiusAdmin, type } from '../../../theme/tokens';
import { Icon } from '../../ui/Icon';
import { PressableScale } from '../../ui/PressableScale';

export type RejectReasonKey = 'feed' | 'age' | 'bio' | 'proof';

export const REJECT_REASONS: Array<{
  key: RejectReasonKey;
  label: string;
  detail: string;
}> = [
  { key: 'feed', label: 'Feed content', detail: 'For You is not college soccer and recruiting' },
  { key: 'age', label: 'Account age', detail: 'The account is too new to post from' },
  { key: 'bio', label: 'Bio and profile', detail: 'The profile does not match the template' },
  { key: 'proof', label: 'Warm-up proof', detail: 'Recordings are missing or too short' },
];

export interface ReasonPickerProps {
  selected: RejectReasonKey[];
  note: string;
  onToggle: (key: RejectReasonKey) => void;
  onNote: (note: string) => void;
}

/** Admin handoff §5 — four structured rejection reasons plus a free-text box. */
export function ReasonPicker({ selected, note, onToggle, onNote }: ReasonPickerProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>Why is it going back</Text>
      {REJECT_REASONS.map((reason) => {
        const on = selected.includes(reason.key);
        return (
          <PressableScale
            key={reason.key}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
            onPress={() => onToggle(reason.key)}
            style={[styles.row, on && styles.rowOn]}
          >
            <View style={[styles.box, on && styles.boxOn]}>
              {on && <Icon name="check" size={12} color={color.white} />}
            </View>
            <View style={styles.column}>
              <Text style={[styles.label, on && styles.labelOn]}>{reason.label}</Text>
              <Text style={styles.detail}>{reason.detail}</Text>
            </View>
          </PressableScale>
        );
      })}
      <TextInput
        multiline
        value={note}
        onChangeText={onNote}
        placeholder="Anything else the creator should fix"
        placeholderTextColor={color.slate400}
        style={styles.input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 8,
    padding: 14,
    borderRadius: radiusAdmin.lg,
    backgroundColor: color.white,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
  },
  title: {
    fontSize: type.size.bodySm,
    fontWeight: type.weight.bold,
    letterSpacing: -0.2,
    color: color.ink,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: radiusAdmin.md,
    borderWidth: borderWidth.field,
    borderColor: color.line,
  },
  rowOn: {
    borderColor: color.blue500,
    backgroundColor: color.blue50,
  },
  box: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: borderWidth.field,
    borderColor: color.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: {
    backgroundColor: color.blue500,
    borderColor: color.blue500,
  },
  column: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  label: {
    fontSize: type.size.chip,
    fontWeight: type.weight.bold,
    color: color.ink,
  },
  labelOn: {
    color: color.blue700,
  },
  detail: {
    fontSize: type.size.label,
    fontWeight: type.weight.regular,
    color: color.slate500,
  },
  input: {
    minHeight: 64,
    textAlignVertical: 'top',
    padding: 10,
    borderRadius: radiusAdmin.md,
    backgroundColor: color.fillQuiet,
    fontSize: type.size.chip,
    lineHeight: type.size.chip * 1.4,
    color: color.ink,
  },
});
