// "Make it" on an idea card asks how first: Handheld (we write every slide)
// or Story (we write the hook and CTA, the creator tells it their way). The
// card's own kind is highlighted when it opens. Freestyle is not offered here.

import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { ChatIdea } from '../../../lib/deck-ai';
import { defaultMakeKind, makeKindsFor, type MakeKind } from '../../../lib/idea-chat';
import { borderWidth, color, radius, type as typeToken } from '../../../theme/tokens';
import { Button } from '../../ui/Button';
import { SheetShell } from '../../ui/SheetShell';
import { MiniDeck } from '../briefs/MiniDeck';

export function MakeKindSheet({
  idea,
  onClose,
  onPick,
}: {
  /** The card being made; null hides the sheet. */
  idea: ChatIdea | null;
  onClose: () => void;
  onPick: (kind: MakeKind) => void;
}) {
  // The last card stays rendered while the sheet slides away.
  const [shown, setShown] = useState<ChatIdea | null>(idea);
  const [kind, setKind] = useState<MakeKind>(idea ? defaultMakeKind(idea) : 'handheld');
  // A new card resets the pick to its default (state set while rendering, no effect).
  if (idea && idea !== shown) {
    setShown(idea);
    setKind(defaultMakeKind(idea));
  }

  const options = shown ? makeKindsFor(shown) : [];
  return (
    <SheetShell
      visible={idea !== null}
      onClose={onClose}
      footer={
        <Button variant="primary" size="md" block icon="sparkles" onPress={() => onPick(kind)}>
          Write it
        </Button>
      }
    >
      <Text style={styles.title}>How should we make it?</Text>
      {shown ? (
        <Text style={styles.cover} numberOfLines={2}>
          {shown.cover}
        </Text>
      ) : null}
      <View style={styles.list}>
        {options.map((o) => {
          const on = o.kind === kind;
          return (
            <Pressable
              key={o.kind}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={o.name}
              onPress={() => setKind(o.kind)}
              style={({ pressed }) => [styles.row, on ? styles.rowOn : null, pressed ? styles.pressed : null]}
            >
              <MiniDeck kind={o.kind} />
              <View style={styles.body}>
                <Text style={[styles.name, on ? styles.nameOn : null]}>{o.name}</Text>
                <Text style={styles.line}>{o.line}</Text>
              </View>
              <View style={[styles.radio, on ? styles.radioOn : null]}>{on ? <View style={styles.radioDot} /> : null}</View>
            </Pressable>
          );
        })}
      </View>
    </SheetShell>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: typeToken.font.display, fontWeight: '700', fontSize: 22, letterSpacing: -0.4, color: color.ink },
  cover: { marginTop: 6, fontFamily: typeToken.font.ui, fontWeight: '500', fontSize: 14, lineHeight: 14 * 1.4, color: color.slate500 },
  list: { marginTop: 16, gap: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: radius.lg,
    borderWidth: borderWidth.field,
    borderColor: color.border,
    backgroundColor: color.white,
  },
  rowOn: { borderColor: color.accent, borderWidth: borderWidth.select, backgroundColor: color.surfaceBrandSoft },
  pressed: { opacity: 0.85 },
  body: { flex: 1, minWidth: 0, gap: 4 },
  name: { fontFamily: typeToken.font.display, fontWeight: '700', fontSize: 17, letterSpacing: -0.3, color: color.ink },
  nameOn: { color: color.blue700 },
  line: { fontFamily: typeToken.font.ui, fontWeight: '500', fontSize: 13.5, lineHeight: 13.5 * 1.4, color: color.slate500 },
  radio: { width: 22, height: 22, borderRadius: 999, borderWidth: 2, borderColor: color.slate300, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: color.accent },
  radioDot: { width: 10, height: 10, borderRadius: 999, backgroundColor: color.accent },
});
