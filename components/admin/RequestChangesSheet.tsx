import { useEffect, useState, type JSX } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { borderWidth, color, radius, ringFocus, type } from '../../theme/tokens';
import { Button } from '../ui/Button';
import { PressableScale } from '../ui/PressableScale';
import { SheetShell } from '../ui/SheetShell';

const REASON_CHIPS = ['Hook lands late', 'Audio', 'Off script', 'Framing'] as const;

/** Request-changes note sheet (README §5.5). */
export function RequestChangesSheet(props: {
  visible: boolean;
  creatorName: string;
  onClose: () => void;
  onSend: (note: string) => void;
}): JSX.Element {
  const { visible, creatorName, onClose, onSend } = props;
  const [note, setNote] = useState('');
  const [selectedChip, setSelectedChip] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!visible) {
      setNote('');
      setSelectedChip(null);
      setFocused(false);
    }
  }, [visible]);

  return (
    <SheetShell visible={visible} onClose={onClose}>
      <Text style={styles.h2}>What should {creatorName} fix?</Text>

      <View style={styles.chipRow}>
        {REASON_CHIPS.map((label) => {
          const selected = selectedChip === label;
          return (
            <PressableScale
              key={label}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              hitSlop={8}
              onPress={() => {
                setSelectedChip(label);
                setNote(label);
              }}
              style={[styles.chip, selected && styles.chipSelected]}
            >
              <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>
                {label}
              </Text>
            </PressableScale>
          );
        })}
      </View>

      <View style={[styles.noteRing, focused && ringFocus]}>
        <TextInput
          multiline
          value={note}
          onChangeText={setNote}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[styles.note, focused && styles.noteFocused]}
        />
      </View>

      <Button
        size="lg"
        variant="primary"
        block
        disabled={note.trim().length === 0}
        onPress={() => onSend(note.trim())}
      >
        {`Send note to ${creatorName}`}
      </Button>

      <Text style={styles.helper}>
        The task goes back to {creatorName}&apos;s queue with your note attached.
      </Text>
    </SheetShell>
  );
}

const styles = StyleSheet.create({
  h2: {
    fontSize: 22,
    lineHeight: 26,
    fontWeight: type.weight.bold,
    letterSpacing: -0.4,
    color: color.ink,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 14,
  },
  chip: {
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: color.fillQuiet,
  },
  chipSelected: {
    backgroundColor: color.blue100,
  },
  chipLabel: {
    fontSize: type.size.chip,
    fontWeight: type.weight.bold,
    color: color.slate500,
  },
  chipLabelSelected: {
    color: color.blue700,
  },
  noteRing: {
    marginTop: 14,
    marginBottom: 14,
    borderWidth: 3,
    borderColor: 'transparent',
    borderRadius: radius.sm + 3,
  },
  note: {
    minHeight: 104,
    padding: 14,
    fontSize: type.size.body,
    lineHeight: 24,
    color: color.ink,
    borderRadius: radius.sm,
    borderWidth: borderWidth.field,
    borderColor: color.borderStrong,
    textAlignVertical: 'top',
  },
  noteFocused: {
    borderColor: color.blue500,
  },
  helper: {
    marginTop: 10,
    textAlign: 'center',
    fontSize: type.size.label,
    fontWeight: '500',
    color: color.slate400,
  },
});
