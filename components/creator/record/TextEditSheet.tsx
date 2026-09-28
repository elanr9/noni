// Words for one on-screen text box. Opens prefilled for an existing box or
// empty for a new one; Done commits, Remove deletes the box. The parent
// keys each opening so the draft text starts fresh.
import { useState, type JSX } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { color, radius, space, type } from '../../../theme/tokens';
import { PressableScale } from '../../ui/PressableScale';
import { SheetShell } from '../../ui/SheetShell';

const MAX_CHARS = 160;

export function TextEditSheet(props: {
  visible: boolean;
  initialText: string;
  isNew: boolean;
  onDone: (text: string) => void;
  onRemove: () => void;
  onClose: () => void;
}): JSX.Element {
  const { visible, initialText, isNew, onDone, onRemove, onClose } = props;
  const [text, setText] = useState(initialText);

  const trimmed = text.trim();

  return (
    <SheetShell visible={visible} onClose={onClose}>
      <View style={styles.head}>
        <Text style={styles.title}>{isNew ? 'Add text' : 'Edit text'}</Text>
        {!isNew ? (
          <Pressable accessibilityRole="button" onPress={onRemove} hitSlop={8}>
            <Text style={styles.remove}>Remove</Text>
          </Pressable>
        ) : null}
      </View>
      <TextInput
        value={text}
        onChangeText={(v) => setText(v.slice(0, MAX_CHARS))}
        placeholder="What should the screen say?"
        placeholderTextColor={color.slate400}
        multiline
        autoFocus
        style={styles.input}
        accessibilityLabel="On-screen text"
      />
      <Text style={styles.count}>
        {trimmed.length} / {MAX_CHARS}
      </Text>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel="Done"
        onPress={() => onDone(trimmed)}
        disabled={trimmed.length === 0}
        style={[styles.done, trimmed.length === 0 && styles.doneOff]}
      >
        <Text style={styles.doneText}>Done</Text>
      </PressableScale>
    </SheetShell>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: type.size.card,
    fontWeight: type.weight.heavy,
    color: color.ink,
  },
  remove: {
    fontSize: type.size.bodySm,
    fontWeight: type.weight.bold,
    color: color.danger,
  },
  input: {
    marginTop: space[4],
    minHeight: 96,
    maxHeight: 180,
    borderRadius: radius.lg,
    backgroundColor: color.ink900,
    color: color.white,
    paddingHorizontal: space[5],
    paddingVertical: space[4],
    fontSize: type.size.body,
    lineHeight: type.size.body * 1.3,
    textAlignVertical: 'top',
  },
  count: {
    marginTop: space[2],
    alignSelf: 'flex-end',
    fontSize: type.size.micro,
    fontWeight: type.weight.semibold,
    color: color.slate400,
  },
  done: {
    marginTop: space[4],
    height: 54,
    borderRadius: radius.pill,
    backgroundColor: color.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneOff: {
    opacity: 0.5,
  },
  doneText: {
    color: color.white,
    fontSize: type.size.action,
    fontWeight: type.weight.heavy,
  },
});
