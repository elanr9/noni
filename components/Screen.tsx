import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const colors = {
  bg: '#F7F5F2',
  ink: '#0B0B0F',
  muted: '#5C5C66',
  accent: '#E85D04',
};

export function Screen({
  children,
  style,
}: {
  children: ReactNode;
  style?: ViewStyle;
}) {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={[styles.inner, style]}>{children}</View>
    </SafeAreaView>
  );
}

export function LoadingScreen({ label = 'Loading' }: { label?: string }) {
  return (
    <Screen style={styles.center}>
      <ActivityIndicator size="large" color={colors.accent} />
      <Text style={styles.muted}>{label}</Text>
    </Screen>
  );
}

export function ConfigErrorScreen({ missing }: { missing: string[] }) {
  return (
    <Screen style={styles.center}>
      <Text style={styles.title}>Noni is not configured</Text>
      <Text style={styles.muted}>
        This build was made without {missing.join(' and ')}. Set them for the
        build environment and ship a new build.
      </Text>
    </Screen>
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

export { colors };

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  inner: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 24,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  brandBlock: {
    gap: 8,
    marginBottom: 32,
  },
  brand: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.accent,
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 34,
    fontWeight: '700',
    color: colors.ink,
    letterSpacing: -0.5,
  },
  muted: {
    fontSize: 16,
    lineHeight: 22,
    color: colors.muted,
  },
});
