import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { borderWidth, color, radiusAdmin, type } from '../../../theme/tokens';
import { Icon } from '../../ui/Icon';
import { MakeButton } from './MakeButton';

export interface IdeaRowProps {
  text: string;
  usedCount: number;
  /** "Sep 4", when the row has been made at least once. */
  lastUsedLabel: string | null;
  last: boolean;
  /** Called with the trimmed text when an inline edit changes it. */
  onSaveText: (text: string) => void;
  onLongPress: () => void;
  /** Meta line tap; only wired when the row already became a post. */
  onMetaPress?: () => void;
  make?: { busy: boolean; disabled: boolean; onPress: () => void };
}

/**
 * One row inside the ideas card. Tapping the text edits it in place on a
 * blue-50 field; blur or Done saves, an unchanged or empty edit is dropped.
 */
export function IdeaRow({
  text,
  usedCount,
  lastUsedLabel,
  last,
  onSaveText,
  onLongPress,
  onMetaPress,
  make,
}: IdeaRowProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  function beginEdit() {
    setDraft(text);
    setEditing(true);
  }

  function commit() {
    setEditing(false);
    const next = draft.trim();
    if (next.length === 0 || next === text.trim()) return;
    onSaveText(next);
  }

  const used = usedCount > 0;

  return (
    <Pressable
      accessibilityRole="button"
      onLongPress={onLongPress}
      onPress={beginEdit}
      style={[styles.row, !last && styles.rowDivider]}
    >
      <View style={styles.body}>
        {editing ? (
          <TextInput
            value={draft}
            onChangeText={setDraft}
            onBlur={commit}
            onSubmitEditing={commit}
            autoFocus
            multiline
            submitBehavior="blurAndSubmit"
            returnKeyType="done"
            style={styles.input}
          />
        ) : (
          <Text style={styles.text}>{text}</Text>
        )}
        {used && (
          <Pressable
            onPress={onMetaPress}
            disabled={onMetaPress === undefined}
            hitSlop={{ top: 6, bottom: 6 }}
            style={styles.metaRow}
          >
            <Text style={styles.meta} numberOfLines={1}>
              {lastUsedLabel ? `Used ${usedCount}x · ${lastUsedLabel}` : `Used ${usedCount}x`}
            </Text>
            {onMetaPress !== undefined && (
              <Icon name="chevron-right" size={12} color={color.blue700} />
            )}
          </Pressable>
        )}
      </View>
      {make !== undefined && !editing && (
        <MakeButton
          label={used ? 'Again' : 'Make'}
          busy={make.busy}
          disabled={make.disabled}
          onPress={make.onPress}
        />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  rowDivider: {
    borderBottomWidth: borderWidth.hair,
    borderBottomColor: color.line,
  },
  body: {
    flex: 1,
    gap: 5,
  },
  text: {
    fontSize: 15,
    fontWeight: '500',
    color: color.ink,
    lineHeight: 15 * 1.4,
  },
  input: {
    fontSize: 15,
    fontWeight: '500',
    color: color.ink,
    lineHeight: 15 * 1.4,
    paddingHorizontal: 6,
    paddingVertical: 4,
    marginHorizontal: -6,
    marginVertical: -4,
    borderRadius: radiusAdmin.sm,
    backgroundColor: color.blue50,
    maxHeight: 120,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  meta: {
    fontSize: type.size.label,
    fontWeight: '700',
    color: color.blue700,
  },
});
