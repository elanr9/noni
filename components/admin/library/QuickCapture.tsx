import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { isCaptureUrl } from '../../../lib/library-api';
import {
  borderWidth,
  color,
  radiusAdmin,
  ringFocus,
  type,
} from '../../../theme/tokens';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';

export interface QuickCaptureProps {
  value: string;
  onChangeText: (text: string) => void;
  onSave: () => void;
  /** Transient confirmation after a save, e.g. "3 ideas saved". */
  note: string | null;
}

/**
 * Admin handoff §9 — quick capture pinned to the top. One field with a plus
 * icon, focus ring, Save once there is text, and a bulk line when a multiline
 * paste will fan out into one idea per line. No sheet, no form, no category.
 */
export function QuickCapture({ value, onChangeText, onSave, note }: QuickCaptureProps) {
  const [focused, setFocused] = useState(false);

  const lines = value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const bulkCount = !isCaptureUrl(value) && lines.length >= 2 ? lines.length : 0;
  const hasText = value.trim().length > 0;

  return (
    <View style={styles.block}>
      <View style={[styles.ring, focused && { borderColor: ringFocus.borderColor }]}>
        <View style={styles.field}>
          <Icon name="plus" size={18} color={color.slate400} />
          <TextInput
            value={value}
            onChangeText={onChangeText}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onSubmitEditing={onSave}
            placeholder="Idea or link. Paste lines for many at once."
            placeholderTextColor={color.slate400}
            multiline
            submitBehavior="blurAndSubmit"
            returnKeyType="done"
            style={styles.input}
          />
          {hasText && (
            <Button size="sm" onPress={onSave}>
              Save
            </Button>
          )}
        </View>
      </View>
      {bulkCount > 0 && (
        <Text style={styles.bulk}>{`${bulkCount} ideas will be saved`}</Text>
      )}
      {note !== null && <Text style={styles.note}>{note}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: 6,
  },
  // The ring is always 3px so focus never shifts layout; it only gains colour.
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
    maxHeight: 110,
    paddingVertical: 4,
    fontSize: type.size.bodySm,
    fontWeight: '600',
    color: color.ink,
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
