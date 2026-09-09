import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import {
  borderWidth,
  color,
  radiusAdmin,
  ringFocus,
  type,
} from '../../../theme/tokens';
import { Icon } from '../../ui/Icon';
import { PressableScale } from '../../ui/PressableScale';

export type CaptureMode = 'idea' | 'reference';

export interface QuickCaptureProps {
  mode: CaptureMode;
  value: string;
  onChangeText: (text: string) => void;
  onSave: () => void;
  /** Reference mode: read the clipboard and save it as a link. */
  onPaste: () => void;
  busy?: boolean;
  /** Transient confirmation after a save, e.g. "3 ideas saved". */
  note: string | null;
}

/**
 * Ideas: type a line and hit the arrow, one idea per non empty line.
 * References: one Paste button that saves whatever link is on the clipboard.
 */
export function QuickCapture({
  mode,
  value,
  onChangeText,
  onSave,
  onPaste,
  busy = false,
  note,
}: QuickCaptureProps) {
  const [focused, setFocused] = useState(false);

  if (mode === 'reference') {
    return (
      <View style={styles.block}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Paste a link from the clipboard"
          disabled={busy}
          onPress={onPaste}
          style={styles.field}
        >
          <Icon name="link" size={18} color={color.slate400} />
          <Text style={styles.placeholder}>Paste a TikTok or Instagram link</Text>
          <PressableScale
            accessibilityRole="button"
            disabled={busy}
            onPress={onPaste}
            style={styles.pasteButton}
          >
            <Icon name="clipboard-paste" size={15} color={color.white} strokeWidth={2.4} />
            <Text style={styles.pasteText}>{busy ? 'Saving' : 'Paste'}</Text>
          </PressableScale>
        </Pressable>
        {note !== null && <Text style={styles.note}>{note}</Text>}
      </View>
    );
  }

  const lines = value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const hasText = lines.length > 0;
  const expanded = focused || value.includes('\n');

  return (
    <View style={styles.block}>
      <View style={[styles.ring, focused && { borderColor: ringFocus.borderColor }]}>
        <View style={styles.field}>
          <TextInput
            value={value}
            onChangeText={onChangeText}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onSubmitEditing={onSave}
            placeholder="Type an idea"
            placeholderTextColor={color.slate400}
            multiline={expanded}
            submitBehavior="blurAndSubmit"
            returnKeyType="done"
            style={[styles.input, expanded && styles.inputExpanded]}
          />
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="Save idea"
            disabled={!hasText || busy}
            onPress={onSave}
            style={[styles.arrow, hasText && styles.arrowReady]}
          >
            <Icon
              name="arrow-right"
              size={16}
              color={hasText ? color.white : color.slate400}
              strokeWidth={2.4}
            />
          </PressableScale>
        </View>
      </View>
      {lines.length >= 2 && (
        <Text style={styles.bulk}>{`${lines.length} ideas will be saved`}</Text>
      )}
      {note !== null && <Text style={styles.note}>{note}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: 6,
  },
  ring: {
    borderWidth: ringFocus.borderWidth,
    borderColor: 'transparent',
    borderRadius: radiusAdmin.md + 3,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingLeft: 14,
    paddingRight: 8,
    borderWidth: borderWidth.field,
    borderColor: color.lineStrong,
    borderRadius: radiusAdmin.md,
    backgroundColor: color.white,
  },
  input: {
    flex: 1,
    minHeight: 32,
    paddingVertical: 4,
    fontSize: type.size.bodySm,
    fontWeight: '600',
    color: color.ink,
  },
  inputExpanded: {
    maxHeight: 110,
  },
  placeholder: {
    flex: 1,
    fontSize: type.size.bodySm,
    fontWeight: '600',
    color: color.slate400,
  },
  arrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.fillQuiet,
  },
  arrowReady: {
    backgroundColor: color.blue500,
  },
  pasteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    height: 32,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.blue500,
  },
  pasteText: {
    fontSize: type.size.label,
    fontWeight: '800',
    color: color.white,
  },
  bulk: {
    fontSize: type.size.label,
    fontWeight: '700',
    color: color.blue700,
  },
  note: {
    fontSize: type.size.label,
    fontWeight: '700',
    color: color.green,
  },
});
