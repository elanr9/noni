import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { color, type } from '../theme/tokens';

export {
  LoadingScreen,
  Screen,
  type ScreenProps,
} from './layout/Screen';

/** Legacy auth/onboarding palette still imported by a few pre-redesign screens. */
export const colors = {
  bg: color.white,
  ink: color.ink,
  muted: color.textMuted,
  accent: color.accent,
};

export function ConfigErrorScreen({ missing }: { missing: string[] }) {
  return (
    <View style={styles.center}>
      <Text style={styles.title}>Noni is not configured</Text>
      <Text style={styles.muted}>
        This build was made without {missing.join(' and ')}. Set them for the
        build environment and ship a new build.
      </Text>
    </View>
  );
}

export function BrandTitle({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <View style={styles.brandBlock}>
      <Text style={styles.brand}>Noni</Text>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.muted}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 32,
    backgroundColor: color.white,
  },
  brandBlock: {
    gap: 8,
    marginBottom: 32,
  },
  brand: {
    fontSize: 18,
    fontWeight: '700',
    color: color.accent,
    letterSpacing: 0.5,
  },
  title: {
    fontSize: type.size.titleXl,
    fontWeight: '700',
    color: color.ink,
    letterSpacing: type.tracking.title,
  },
  muted: {
    fontSize: type.size.body,
    lineHeight: 22,
    color: color.textMuted,
  },
});
