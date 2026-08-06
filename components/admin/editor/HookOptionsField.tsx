import type { JSX } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { color, radius, type } from '../../../theme/tokens';
import { Button } from '../../ui/Button';
import { PressableScale } from '../../ui/PressableScale';

/**
 * ALL 8-10 hook options, best first, default index 0. The selected one
 * lands in briefs.hook. Every option stays editable; the stale nudge shows
 * when the body changed under the hook. Nothing regenerates on its own.
 */
export function HookOptionsField(props: {
  options: string[];
  chosenIndex: number;
  stale: boolean;
  busy: boolean;
  onChoose: (index: number) => void;
  onChangeOption: (index: number, text: string) => void;
  onRegenerate: () => void;
}): JSX.Element {
  const { options, chosenIndex, stale, busy, onChoose, onChangeOption, onRegenerate } =
    props;

  return (
    <View style={styles.section}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>Hook</Text>
        <Button size="sm" variant="tint" disabled={busy} onPress={onRegenerate}>
          {busy ? 'Regenerating…' : 'Regenerate'}
        </Button>
      </View>
      {stale ? (
        <Text style={styles.stale}>
          The body changed since these hooks were written. Reword or
          regenerate if the chosen one no longer fits.
        </Text>
      ) : null}
      {options.length === 0 ? (
        <Text style={styles.empty}>
          No hooks yet. Fill the post or regenerate against the talking
          points.
        </Text>
      ) : null}
      {options.map((option, i) => {
        const selected = chosenIndex === i;
        return (
          <View key={`hook-${i}`} style={styles.row}>
            <PressableScale
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => onChoose(i)}
              style={[styles.radio, selected && styles.radioOn]}
            >
              <Text style={[styles.radioText, selected && styles.radioTextOn]}>
                {i + 1}
              </Text>
            </PressableScale>
            <TextInput
              multiline
              value={option}
              onChangeText={(text) => onChangeOption(i, text)}
              style={[styles.field, selected && styles.fieldOn]}
            />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 8, marginBottom: 16 },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    fontSize: type.size.label,
    fontWeight: '800',
    color: color.slate400,
    letterSpacing: type.tracking.label,
    textTransform: 'uppercase',
  },
  stale: {
    fontSize: type.size.meta,
    fontWeight: '600',
    color: color.amber,
    backgroundColor: color.amberSoft,
    padding: 8,
    borderRadius: radius.sm,
  },
  empty: {
    fontSize: type.size.meta,
    color: color.slate400,
  },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  radio: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.fillQuiet,
  },
  radioOn: { backgroundColor: color.blue100 },
  radioText: {
    fontSize: type.size.meta,
    fontWeight: '800',
    color: color.slate400,
  },
  radioTextOn: { color: color.blue700 },
  field: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: color.lineStrong,
    borderRadius: radius.sm,
    paddingVertical: 9,
    paddingHorizontal: 12,
    fontSize: type.size.bodySm,
    color: color.ink,
    backgroundColor: color.white,
  },
  fieldOn: { borderColor: color.blue700 },
});
