import { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { borderWidth, color, radiusAdmin, type } from '../../../theme/tokens';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { PressableScale } from '../../ui/PressableScale';

export interface SectionNoteCardProps {
  /** "Hook" / "Clip 2" / "Slide 3" / "Caption". */
  label: string;
  text: string;
  note: string | null;
  open: boolean;
  onOpen: () => void;
  onCancel: () => void;
  onSave: (note: string) => void;
  onRemove: () => void;
}

/**
 * Admin handoff §3 revision card — tap opens a blue-50 note box under it.
 * A saved note turns the border blue-500 and the label reads `Note added`.
 */
export function SectionNoteCard({
  label,
  text,
  note,
  open,
  onOpen,
  onCancel,
  onSave,
  onRemove,
}: SectionNoteCardProps) {
  const [draft, setDraft] = useState('');
  const noted = note !== null;

  useEffect(() => {
    if (open) setDraft(note ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <View style={styles.wrap}>
      <PressableScale
        accessibilityRole="button"
        onPress={onOpen}
        style={[styles.card, noted && styles.cardNoted]}
      >
        <Text style={[styles.label, noted && styles.labelNoted]}>
          {(noted ? 'Note added' : label).toUpperCase()}
        </Text>
        <Text style={styles.text}>{text}</Text>
      </PressableScale>

      {noted && !open && (
        <View style={styles.noteBlock}>
          <Text style={styles.noteText}>{note}</Text>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="Remove note"
            onPress={onRemove}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Icon name="x" size={14} color={color.blue700} />
          </PressableScale>
        </View>
      )}

      {open && (
        <View style={styles.editor}>
          <TextInput
            multiline
            autoFocus
            value={draft}
            onChangeText={setDraft}
            placeholder="What should change"
            placeholderTextColor={color.slate400}
            style={styles.input}
          />
          <View style={styles.editorRow}>
            <Button variant="ghost" size="sm" onPress={onCancel}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={draft.trim().length === 0}
              onPress={() => onSave(draft.trim())}
            >
              Save note
            </Button>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 6,
  },
  card: {
    gap: 5,
    padding: 14,
    borderRadius: radiusAdmin.lg,
    backgroundColor: color.white,
    borderWidth: borderWidth.field,
    borderColor: color.line,
  },
  cardNoted: {
    borderColor: color.blue500,
  },
  label: {
    fontSize: type.size.micro11,
    fontWeight: type.weight.bold,
    letterSpacing: type.tracking.label,
    color: color.slate400,
  },
  labelNoted: {
    color: color.blue600,
  },
  text: {
    fontSize: type.size.meta,
    lineHeight: type.size.meta * 1.45,
    fontWeight: type.weight.regular,
    color: color.ink,
  },
  noteBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: radiusAdmin.md,
    backgroundColor: color.blue50,
  },
  noteText: {
    flex: 1,
    fontSize: type.size.chip,
    lineHeight: type.size.chip * 1.4,
    fontWeight: type.weight.semibold,
    color: color.blue700,
  },
  editor: {
    gap: 10,
    padding: 12,
    borderRadius: radiusAdmin.md,
    backgroundColor: color.blue50,
  },
  input: {
    minHeight: 70,
    textAlignVertical: 'top',
    fontSize: type.size.meta,
    lineHeight: type.size.meta * 1.4,
    color: color.ink,
    padding: 0,
  },
  editorRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
});
