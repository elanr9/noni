import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import * as Clipboard from 'expo-clipboard';

import { color, radiusAdmin, type } from '../../../theme/tokens';
import { PressableScale } from '../../ui/PressableScale';

export interface CopyChipProps {
  value: string;
  /** What is being copied, for the accessibility label. */
  label: string;
}

/** Admin handoff §5 account template — one-tap Copy with a Copied beat. */
export function CopyChip({ value, label }: CopyChipProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  const copy = async () => {
    await Clipboard.setStringAsync(value);
    setCopied(true);
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1600);
  };

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`Copy ${label}`}
      disabled={value.trim().length === 0}
      onPress={() => void copy()}
      style={[styles.chip, copied && styles.chipCopied, value.trim().length === 0 && styles.chipDisabled]}
    >
      <Text style={[styles.text, copied && styles.textCopied]}>
        {copied ? 'Copied' : 'Copy'}
      </Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.blue100,
  },
  chipCopied: {
    backgroundColor: color.greenSoft,
  },
  chipDisabled: {
    opacity: 0.5,
  },
  text: {
    fontSize: type.size.label,
    fontWeight: type.weight.bold,
    color: color.blue700,
  },
  textCopied: {
    color: color.green,
  },
});
