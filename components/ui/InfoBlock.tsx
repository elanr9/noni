import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { color, type } from '../../theme/tokens';

export interface InfoBlockProps {
  label: string;
  children: ReactNode | string;
}

/** Labelled copy block: HOOK / SCRIPT / CAPTION / SLIDE COPY. */
export function InfoBlock({ label, children }: InfoBlockProps) {
  return (
    <View style={styles.block}>
      <Text style={styles.label}>{label.toUpperCase()}</Text>
      {typeof children === 'string' ? (
        <Text style={styles.body}>{children}</Text>
      ) : (
        children
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: 6,
  },
  label: {
    fontSize: type.size.label,
    fontWeight: '800',
    letterSpacing: type.tracking.label,
    textTransform: 'uppercase',
    color: color.slate400,
  },
  body: {
    fontSize: type.size.body,
    lineHeight: 24,
    color: color.ink,
  },
});
