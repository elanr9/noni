// Revise with AI (SSManager.jsx ReviseSheet): the format's revise chips
// verbatim from ss-data, or a free line. The rest of the brief stays.

import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { BriefMediaFormat } from '../../../../lib/briefs-api';
import { color, radius, type as typeToken } from '../../../../theme/tokens';
import { Icon } from '../../../ui/Icon';
import { Sheet } from '../../shared';

export const REVISE_CHIPS: Record<BriefMediaFormat, string[]> = {
  slideshow: ['Write 5 points from the cover', 'Make the cover stop the scroll', 'Tighten every slide to one line', 'Add a clear Inkbound plug'],
  reel: ['Write 5 points from the hook', 'Make the hook stop the scroll', 'One idea per point', 'Add a clear Inkbound plug'],
};

export function ReviseSheet({
  visible,
  format,
  companyName,
  onPick,
  onClose,
}: {
  visible: boolean;
  format: BriefMediaFormat;
  companyName?: string;
  onPick: (feedback: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState('');
  const chips = REVISE_CHIPS[format].map((c) => (companyName ? c.replace('Inkbound', companyName) : c));
  const send = (f: string) => {
    onClose();
    setText('');
    onPick(f);
  };
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      pinnedTop={220}
      header={
        <View style={styles.head}>
          <Text style={styles.title}>Revise with AI</Text>
          <Text style={styles.sub}>Say what should change. The rest stays.</Text>
        </View>
      }
      footer={
        <View style={styles.inputRow}>
          <TextInput value={text} onChangeText={setText} placeholder="What should change?" placeholderTextColor={color.slate400} style={styles.input} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send"
            disabled={!text.trim()}
            onPress={() => send(text.trim())}
            style={[styles.send, { backgroundColor: text.trim() ? color.blue500 : color.fillQuiet }]}
          >
            <Icon name="send" size={18} color={text.trim() ? color.white : color.slate400} />
          </Pressable>
        </View>
      }
    >
      <View style={styles.list}>
        {chips.map((r) => (
          <Pressable key={r} accessibilityRole="button" onPress={() => send(r)} style={({ pressed }) => [styles.chip, pressed ? styles.pressed : null]}>
            <Text style={styles.chipText}>{r}</Text>
          </Pressable>
        ))}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  head: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 12 },
  title: { fontFamily: typeToken.font.display, fontWeight: '700', fontSize: 22, letterSpacing: -0.4, color: color.ink },
  sub: { marginTop: 4, fontFamily: typeToken.font.ui, fontWeight: '400', fontSize: 14, color: color.slate500 },
  list: { gap: 8 },
  chip: { minHeight: 48, justifyContent: 'center', paddingVertical: 14, paddingHorizontal: 16, borderRadius: radius.sm, backgroundColor: color.blue50 },
  pressed: { opacity: 0.85 },
  chipText: { fontFamily: typeToken.font.ui, fontWeight: '600', fontSize: 15, color: color.ink },
  inputRow: { flexDirection: 'row', gap: 8 },
  input: { flex: 1, minHeight: 50, paddingVertical: 11, paddingHorizontal: 16, borderRadius: radius.sm, backgroundColor: color.white, borderWidth: 1, borderColor: color.border, fontFamily: typeToken.font.ui, fontWeight: '500', fontSize: 16, color: color.ink },
  send: { width: 50, height: 50, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
});
