import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { colors } from './Screen';

export function ProgressBar({ step, total }: { step: number; total: number }) {
  const fraction = total <= 1 ? 1 : step / (total - 1);
  return (
    <View style={styles.track}>
      <View style={[styles.fill, { flex: fraction }]} />
      <View style={{ flex: 1 - fraction }} />
    </View>
  );
}

export function StepShell({
  step,
  total,
  title,
  subtitle,
  children,
  onBack,
  primaryLabel,
  onPrimary,
  primaryDisabled,
}: {
  step: number;
  total: number;
  title: string;
  subtitle?: string;
  children?: ReactNode;
  onBack?: () => void;
  primaryLabel: string;
  onPrimary: () => void;
  primaryDisabled?: boolean;
}) {
  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={12} disabled={!onBack}>
          <Text style={[styles.back, !onBack && styles.backHidden]}>Back</Text>
        </Pressable>
        <ProgressBar step={step} total={total} />
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        {children}
      </ScrollView>

      <Pressable
        style={[styles.primary, primaryDisabled && styles.primaryOff]}
        disabled={primaryDisabled}
        onPress={onPrimary}
      >
        <Text style={styles.primaryText}>{primaryLabel}</Text>
      </Pressable>
    </KeyboardAvoidingView>
  );
}

export function OptionCard({
  label,
  hint,
  selected,
  onPress,
}: {
  label: string;
  hint?: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.option, selected && styles.optionOn]}
      onPress={onPress}
    >
      <Text style={[styles.optionLabel, selected && styles.optionLabelOn]}>
        {label}
      </Text>
      {hint ? <Text style={styles.optionHint}>{hint}</Text> : null}
    </Pressable>
  );
}

export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.chip, selected && styles.chipOn]} onPress={onPress}>
      <Text style={[styles.chipText, selected && styles.chipTextOn]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 8,
  },
  back: { fontSize: 16, fontWeight: '700', color: colors.muted, width: 44 },
  backHidden: { opacity: 0 },
  track: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#E6E2DA',
    flexDirection: 'row',
    overflow: 'hidden',
  },
  fill: { backgroundColor: colors.accent, borderRadius: 3 },
  body: { paddingVertical: 24, gap: 12 },
  title: {
    fontSize: 30,
    fontWeight: '700',
    color: colors.ink,
    letterSpacing: -0.5,
  },
  subtitle: { fontSize: 16, lineHeight: 22, color: colors.muted },
  primary: {
    backgroundColor: colors.ink,
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
  },
  primaryOff: { opacity: 0.35 },
  primaryText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  option: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#E6E2DA',
    padding: 18,
    gap: 4,
  },
  optionOn: { borderColor: colors.accent },
  optionLabel: { fontSize: 17, fontWeight: '700', color: colors.ink },
  optionLabelOn: { color: colors.accent },
  optionHint: { fontSize: 14, color: colors.muted },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: '#E6E2DA',
    backgroundColor: '#FFFFFF',
  },
  chipOn: { borderColor: colors.accent, backgroundColor: colors.accent },
  chipText: { fontSize: 15, fontWeight: '700', color: colors.ink },
  chipTextOn: { color: '#FFFFFF' },
});
