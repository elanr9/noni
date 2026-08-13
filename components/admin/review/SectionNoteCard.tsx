import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { ContentFormat } from '../../../lib/admin-review-types';
import { borderWidth, color, radiusAdmin, shadow, type } from '../../../theme/tokens';
import { NoteBlock, PostThumb } from '../shared';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { PressableScale } from '../../ui/PressableScale';

export interface SectionNoteCardProps {
  /** "Hook" / "Clip 2" / "Slide 3". Spoken sections only, never Caption. */
  label: string;
  text: string;
  format: ContentFormat;
  note: string | null;
  open: boolean;
  /** Card body tap: the watch sheet. */
  onWatch: () => void;
  /** Plus icon tap: the inline note editor under the card. */
  onOpen: () => void;
  onCancel: () => void;
  onSave: (note: string) => void;
  onRemove: () => void;
}

/**
 * Admin handoff §3 revision card — thumb, uppercase slot label, section
 * text. A saved note turns the border blue-500, shows `Note added` and a
 * blue-50 note block with a remove x.
 */
export function SectionNoteCard({
  label,
  text,
  format,
  note,
  open,
  onWatch,
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
    <View style={[styles.card, shadow.shadowCard, (noted || open) && styles.cardActive]}>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={`Watch ${label}`}
        onPress={onWatch}
        style={styles.body}
      >
        <PostThumb format={format} width={46} height={62} radius={9} />
        <View style={styles.main}>
          <View style={styles.labelRow}>
            <Text style={[styles.label, noted && styles.labelNoted]}>
              {label.toUpperCase()}
            </Text>
            <View style={styles.spacer} />
            {noted ? (
              <View style={styles.notedTag}>
                <Icon name="pencil" size={12} color={color.blue700} />
                <Text style={styles.notedText}>Note added</Text>
              </View>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Add note to ${label}`}
                hitSlop={15}
                onPress={open ? onCancel : onOpen}
              >
                <Icon name="plus" size={15} color={color.slate300} />
              </Pressable>
            )}
          </View>
          <Text style={styles.text}>{text}</Text>
        </View>
      </PressableScale>

      {note !== null && !open && (
        <NoteBlock onRemove={onRemove} style={styles.noteBlock}>
          {note}
        </NoteBlock>
      )}

      {open && (
        <View style={styles.editor}>
          <TextInput
            autoFocus
            multiline
            value={draft}
            onChangeText={setDraft}
            placeholder="What to change here"
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
  card: {
    backgroundColor: color.white,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
    borderRadius: radiusAdmin.lg,
  },
  cardActive: {
    borderColor: color.blue500,
  },
  body: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 11,
    padding: 12,
  },
  main: {
    flex: 1,
    minWidth: 0,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  label: {
    fontSize: type.size.micro11,
    fontWeight: type.weight.bold,
    letterSpacing: type.tracking.label,
    color: color.slate400,
  },
  labelNoted: {
    color: color.blue700,
  },
  spacer: {
    flex: 1,
  },
  notedTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  notedText: {
    fontSize: type.size.micro11,
    fontWeight: type.weight.bold,
    color: color.blue700,
  },
  text: {
    marginTop: 5,
    fontSize: 13.5,
    lineHeight: 13.5 * 1.45,
    fontWeight: type.weight.regular,
    color: color.ink,
  },
  noteBlock: {
    marginHorizontal: 13,
    marginBottom: 13,
  },
  editor: {
    marginHorizontal: 13,
    marginBottom: 13,
    padding: 11,
    borderRadius: radiusAdmin.sm,
    backgroundColor: color.blue50,
    gap: 9,
  },
  input: {
    minHeight: 70,
    padding: 11,
    borderRadius: radiusAdmin.sm,
    borderWidth: borderWidth.field,
    borderColor: color.blue300,
    backgroundColor: color.white,
    fontSize: type.size.meta,
    lineHeight: type.size.meta * 1.45,
    color: color.ink,
    textAlignVertical: 'top',
  },
  editorRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 7,
  },
});
