// Dark bottom sheet for the words of one text box. Sits above the keyboard.
// Mounted only while open, so the draft starts from initialText each time.
import { useState, type JSX } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { color, type } from '../../../theme/tokens';
import { Icon } from '../../ui/Icon';
import { PressableScale } from '../../ui/PressableScale';

export const TEXT_BOX_MAX_CHARS = 160;

export function TextEditSheet(props: {
  initialText: string;
  title: string;
  bottomInset: number;
  onCancel: () => void;
  onSave: (text: string) => void;
}): JSX.Element {
  const { initialText, title, bottomInset, onCancel, onSave } = props;
  const [text, setText] = useState(initialText);

  const trimmed = text.trim();
  const canSave = trimmed.length > 0;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable accessibilityLabel="Close" style={styles.scrim} onPress={onCancel} />
        <View style={[styles.panel, { paddingBottom: Math.max(bottomInset, 12) }]}>
          <View style={styles.header}>
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              onPress={onCancel}
              hitSlop={10}
              style={styles.headerBtn}
            >
              <Icon name="x" size={20} color={color.white} />
            </PressableScale>
            <Text style={styles.title}>{title}</Text>
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="Done"
              onPress={() => onSave(trimmed)}
              disabled={!canSave}
              hitSlop={10}
              style={[styles.headerBtn, !canSave && styles.headerBtnOff]}
            >
              <Icon name="check" size={20} color={color.white} />
            </PressableScale>
          </View>
          <TextInput
            value={text}
            onChangeText={setText}
            multiline
            autoFocus
            maxLength={TEXT_BOX_MAX_CHARS}
            placeholder="Type your text"
            placeholderTextColor={color.whiteA45}
            selectionColor={color.white}
            keyboardAppearance="dark"
            accessibilityLabel="Text box words"
            style={styles.input}
          />
          <Text style={styles.counter}>{`${text.length}/${TEXT_BOX_MAX_CHARS}`}</Text>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  scrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  panel: {
    backgroundColor: '#111114',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 12,
    paddingTop: 8,
    gap: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 40,
  },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1C1C1E',
  },
  headerBtnOff: {
    opacity: 0.4,
  },
  title: {
    color: color.white,
    fontSize: type.size.bodySm,
    fontWeight: '700',
  },
  input: {
    minHeight: 96,
    maxHeight: 180,
    color: color.white,
    fontSize: type.size.bodySm,
    lineHeight: 22,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#1C1C1E',
    textAlignVertical: 'top',
  },
  counter: {
    alignSelf: 'flex-end',
    color: color.whiteA60,
    fontSize: type.size.label,
    fontVariant: ['tabular-nums'],
    paddingRight: 4,
  },
});
