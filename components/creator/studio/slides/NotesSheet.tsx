import type { JSX } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { color, radius, type } from '../../../../theme/tokens';
import { SheetShell } from '../../../ui/SheetShell';

export type StudioNotes = { title: string; lines: string[] };

/** The brief as guidance. The line matching the current slide is marked as a hint. */
export function NotesSheet(props: {
  visible: boolean;
  onClose: () => void;
  notes: StudioNotes | null;
  slideIndex: number;
}): JSX.Element {
  const { visible, onClose, notes, slideIndex } = props;
  const lines = notes?.lines ?? [];
  return (
    <SheetShell visible={visible} onClose={onClose}>
      <Text style={styles.label}>From the brief</Text>
      {notes ? <Text style={styles.title}>{notes.title}</Text> : null}
      <View style={styles.list}>
        {lines.map((line, i) => {
          const hint = i === slideIndex;
          return (
            <View key={i} style={[styles.line, hint && styles.lineOn]}>
              <Text style={[styles.num, hint && styles.numOn]}>{i + 1}</Text>
              <View style={styles.lineBody}>
                {hint ? <Text style={styles.hintLabel}>This slide</Text> : null}
                <Text style={styles.lineText}>{line}</Text>
              </View>
            </View>
          );
        })}
        {lines.length === 0 ? <Text style={styles.lineText}>No notes for this post.</Text> : null}
      </View>
    </SheetShell>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: type.size.micro,
    fontWeight: type.weight.heavy,
    letterSpacing: type.tracking.label,
    textTransform: 'uppercase',
    color: color.slate400,
  },
  title: {
    marginTop: 6,
    fontSize: type.size.card,
    fontWeight: type.weight.heavy,
    color: color.ink,
  },
  list: {
    marginTop: 14,
    gap: 8,
  },
  line: {
    flexDirection: 'row',
    gap: 10,
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: color.offWhite,
  },
  lineOn: {
    backgroundColor: color.surfaceBrandSoft,
  },
  num: {
    width: 20,
    fontSize: type.size.bodySm,
    fontWeight: type.weight.heavy,
    color: color.slate400,
  },
  numOn: {
    color: color.textBrand,
  },
  lineBody: {
    flex: 1,
    gap: 2,
  },
  hintLabel: {
    fontSize: type.size.micro,
    fontWeight: type.weight.heavy,
    letterSpacing: type.tracking.label,
    textTransform: 'uppercase',
    color: color.textBrand,
  },
  lineText: {
    fontSize: type.size.bodySm,
    lineHeight: type.size.bodySm * type.leading.snug,
    color: color.ink,
  },
});
