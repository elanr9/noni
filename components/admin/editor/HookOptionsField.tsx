// Admin handoff §8 step 3 — the hook options. 8–10 options best first,
// radio rows with word counts (red over 9), selected row blue-50 with a
// blue-500 border, first row marked best scored. "Other" expands an
// inline write field. Nothing regenerates on its own.
import type { JSX } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { color, radiusAdmin, type } from '../../../theme/tokens';
import { Icon } from '../../ui/Icon';
import { PressableScale } from '../../ui/PressableScale';
import { SectionLabel } from '../shared';
import { AiPill } from './AiPill';

const HOOK_MAX_WORDS = 9;

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function Radio({ selected }: { selected: boolean }): JSX.Element {
  return (
    <View style={[styles.radio, selected && styles.radioOn]}>
      {selected && <Icon name="check" size={13} color={color.white} strokeWidth={3} />}
    </View>
  );
}

export function HookOptionsField(props: {
  options: string[];
  chosenIndex: number;
  stale: boolean;
  busy: boolean;
  onChoose: (index: number) => void;
  onRegenerate: () => void;
  onOpenLibrary: () => void;
  /** When true, the free-write "Other" option is selected. */
  useCustom: boolean;
  customText: string;
  onChooseCustom: () => void;
  onChangeCustom: (text: string) => void;
}): JSX.Element {
  const {
    options,
    chosenIndex,
    stale,
    busy,
    onChoose,
    onRegenerate,
    onOpenLibrary,
    useCustom,
    customText,
    onChooseCustom,
    onChangeCustom,
  } = props;

  const customWords = wordCount(customText);

  return (
    <View style={styles.section}>
      <View style={styles.headRow}>
        <SectionLabel>{`${options.length} options`}</SectionLabel>
        <View style={styles.pillRow}>
          <AiPill icon="rotate-ccw" label="Regenerate" busy={busy} onPress={onRegenerate} />
          <AiPill icon="images" label="Library" onPress={onOpenLibrary} />
        </View>
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
        const selected = !useCustom && chosenIndex === i;
        const words = wordCount(option);
        const over = words > HOOK_MAX_WORDS;
        return (
          <PressableScale
            key={`hook-${i}`}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => onChoose(i)}
            style={[styles.row, selected && styles.rowOn]}
          >
            <Radio selected={selected} />
            <View style={styles.rowBody}>
              <Text style={styles.hookText}>{option}</Text>
              <Text style={[styles.meta, over && styles.metaOver]}>
                {i === 0
                  ? `${words} words · best scored`
                  : `${words} ${words === 1 ? 'word' : 'words'}`}
              </Text>
            </View>
          </PressableScale>
        );
      })}

      <PressableScale
        accessibilityRole="radio"
        accessibilityState={{ selected: useCustom }}
        onPress={onChooseCustom}
        style={[styles.row, useCustom && styles.rowOn]}
      >
        <Radio selected={useCustom} />
        <View style={styles.rowBody}>
          <Text style={styles.hookText}>Other</Text>
          {useCustom ? (
            <>
              <TextInput
                multiline
                value={customText}
                onChangeText={onChangeCustom}
                onFocus={onChooseCustom}
                placeholder="Write your own"
                placeholderTextColor={color.slate400}
                style={styles.customField}
                autoFocus
              />
              <Text
                style={[
                  styles.meta,
                  customWords > HOOK_MAX_WORDS && styles.metaOver,
                ]}
              >
                {`${customWords} ${customWords === 1 ? 'word' : 'words'}`}
              </Text>
            </>
          ) : (
            <Text style={styles.meta}>Write your own</Text>
          )}
        </View>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 10 },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  pillRow: {
    flexDirection: 'row',
    gap: 8,
  },
  stale: {
    fontSize: 13,
    fontWeight: '600',
    color: color.amber,
    backgroundColor: color.amberSoft,
    padding: 10,
    borderRadius: radiusAdmin.sm,
  },
  empty: {
    fontSize: 13,
    color: color.slate400,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 14,
    borderRadius: radiusAdmin.lg,
    borderWidth: 1.5,
    borderColor: color.line,
    backgroundColor: color.white,
  },
  rowOn: {
    borderColor: color.blue500,
    backgroundColor: color.blue50,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: radiusAdmin.pill,
    borderWidth: 1.5,
    borderColor: color.lineStrong,
    backgroundColor: color.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  radioOn: {
    borderColor: color.blue500,
    backgroundColor: color.blue500,
  },
  rowBody: {
    flex: 1,
    gap: 4,
  },
  hookText: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 15 * 1.35,
    letterSpacing: type.tracking.flat,
    color: color.ink,
  },
  meta: {
    fontSize: 12,
    fontWeight: '400',
    color: color.slate400,
  },
  metaOver: {
    fontWeight: '600',
    color: color.danger,
  },
  customField: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 15 * 1.35,
    color: color.ink,
    padding: 0,
  },
});
