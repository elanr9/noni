// Revise with AI (SSManager.jsx ReviseSheet): the format's revise chips
// verbatim from ss-data, or a free line. The rest of the brief stays. The
// post's own conversation (what was asked, what the AI changed) shows above
// the chips and is kept per post, so reopening the sheet picks it back up.

import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { BriefMediaFormat } from '../../../../lib/briefs-api';
import type { ReviseTurn } from '../../../../lib/revise-chat';
import { color, radius, type as typeToken } from '../../../../theme/tokens';
import { Icon } from '../../../ui/Icon';
import { Sheet } from '../../shared';

export const REVISE_CHIPS: Record<BriefMediaFormat, string[]> = {
  slideshow: [
    'Make the cover stop the scroll',
    'Cut every slide to one short line',
    'Sound like a real player, less like a brand',
    'Make the {product} slide feel like a tip, not an ad',
  ],
  reel: [
    'Make the hook stop the scroll',
    'One idea per point',
    'Sound like a real player, less like a brand',
    'Make the {product} plug feel like a tip, not an ad',
  ],
};

export function ReviseSheet({
  visible,
  format,
  companyName,
  history = [],
  working = false,
  onPick,
  onClose,
}: {
  visible: boolean;
  format: BriefMediaFormat;
  companyName?: string;
  /** This post's revise conversation, oldest first. */
  history?: ReviseTurn[];
  /** A revise is running now. */
  working?: boolean;
  onPick: (feedback: string) => void;
  onClose: () => void;
}) {
  const recent = history.slice(-8);
  const [text, setText] = useState('');
  const chips = REVISE_CHIPS[format].map((c) => c.replace('{product}', companyName || 'product'));
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
      {recent.length > 0 || working ? (
        <View style={styles.thread}>
          {recent.map((t, k) => (
            <View key={`${t.at}-${k}`} style={[styles.bubble, t.role === 'user' ? styles.mine : styles.theirs]}>
              <Text style={[styles.bubbleText, t.role === 'user' ? styles.mineText : null]}>{t.text}</Text>
            </View>
          ))}
          {working ? (
            <View style={[styles.bubble, styles.theirs]}>
              <Text style={[styles.bubbleText, styles.quiet]}>Revising…</Text>
            </View>
          ) : null}
        </View>
      ) : null}
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
  thread: { gap: 6, marginBottom: 16 },
  bubble: { maxWidth: '86%', paddingVertical: 9, paddingHorizontal: 13, borderRadius: 16 },
  mine: { alignSelf: 'flex-end', backgroundColor: color.blue500, borderBottomRightRadius: 4 },
  theirs: { alignSelf: 'flex-start', backgroundColor: color.fillQuiet, borderBottomLeftRadius: 4 },
  bubbleText: { fontFamily: typeToken.font.ui, fontWeight: '500', fontSize: 14.5, lineHeight: 20, color: color.ink },
  mineText: { color: color.white },
  quiet: { color: color.slate500 },
  chip: { minHeight: 48, justifyContent: 'center', paddingVertical: 14, paddingHorizontal: 16, borderRadius: radius.sm, backgroundColor: color.blue50 },
  pressed: { opacity: 0.85 },
  chipText: { fontFamily: typeToken.font.ui, fontWeight: '600', fontSize: 15, color: color.ink },
  inputRow: { flexDirection: 'row', gap: 8 },
  input: { flex: 1, minHeight: 50, paddingVertical: 11, paddingHorizontal: 16, borderRadius: radius.sm, backgroundColor: color.white, borderWidth: 1, borderColor: color.border, fontFamily: typeToken.font.ui, fontWeight: '500', fontSize: 16, color: color.ink },
  send: { width: 50, height: 50, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
});
