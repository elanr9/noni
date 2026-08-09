import { useEffect, useState, type ReactNode } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';

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

// ——— Cal AI style components (creator pre-auth onboarding only) ———
// Grayscale look: white screen, black question, grey subtext, black pill CTA.

export const cal = {
  bg: '#FFFFFF',
  ink: '#0B0B0F',
  sub: '#8A8A8E',
  field: '#F2F2F7',
  line: '#E5E5EA',
  disabled: '#D1D1D6',
} as const;

// KeyboardAvoidingView compares its own onLayout frame against screen space
// keyboard coordinates, which only lines up when the view starts at the top of
// the screen. Inside a SafeAreaView it under-shoots and leaves the CTA behind
// the keyboard, so measure the keyboard directly instead. metrics() seeds the
// height for a step that mounts while the keyboard is already open.
function useKeyboardHeight(): number {
  const [height, setHeight] = useState(() => Keyboard.metrics()?.height ?? 0);

  useEffect(() => {
    const shown = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillChangeFrame' : 'keyboardDidShow',
      (event) => setHeight(event.endCoordinates.height),
    );
    const hidden = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setHeight(0),
    );

    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);

  return height;
}

export function CalShell({
  progress,
  onBack,
  title,
  subtitle,
  children,
  primaryLabel,
  onPrimary,
  primaryDisabled,
  footer,
}: {
  /** 0..1 fill of the thin progress bar. */
  progress: number;
  onBack?: () => void;
  title?: string;
  subtitle?: string;
  children?: ReactNode;
  primaryLabel?: string;
  onPrimary?: () => void;
  primaryDisabled?: boolean;
  /** Rendered above the pill button, for skip links and legal text. */
  footer?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();

  return (
    <SafeAreaView style={calStyles.safe} edges={['top', 'left', 'right']}>
      <View
        style={[
          calStyles.flex,
          { paddingBottom: keyboardHeight || insets.bottom },
        ]}
      >
        <View style={calStyles.header}>
          <Pressable
            onPress={onBack}
            hitSlop={12}
            disabled={!onBack}
            style={[calStyles.backBtn, !onBack && calStyles.backHidden]}
          >
            <ChevronLeft size={26} color={cal.ink} strokeWidth={2.5} />
          </Pressable>
          <View style={calStyles.track}>
            <View style={[calStyles.fill, { flex: Math.max(progress, 0.02) }]} />
            <View style={{ flex: Math.max(1 - progress, 0) }} />
          </View>
          <View style={calStyles.backBtn} />
        </View>

        <ScrollView
          style={calStyles.flex}
          contentContainerStyle={calStyles.body}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {title ? <Text style={calStyles.title}>{title}</Text> : null}
          {subtitle ? <Text style={calStyles.subtitle}>{subtitle}</Text> : null}
          {children}
        </ScrollView>

        <View style={calStyles.footer}>
          {footer}
          {primaryLabel && onPrimary ? (
            <Pressable
              style={[calStyles.primary, primaryDisabled && calStyles.primaryOff]}
              disabled={primaryDisabled}
              onPress={onPrimary}
            >
              <Text style={calStyles.primaryText}>{primaryLabel}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </SafeAreaView>
  );
}

export function CalOption({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[calStyles.option, selected && calStyles.optionOn]}
      onPress={onPress}
    >
      <Text style={[calStyles.optionText, selected && calStyles.optionTextOn]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function CalTextField(props: TextInputProps) {
  return (
    <TextInput
      placeholderTextColor={cal.sub}
      {...props}
      style={[calStyles.input, props.style]}
    />
  );
}

export function CalAuthButton({
  label,
  variant,
  onPress,
  disabled,
}: {
  label: string;
  variant: 'black' | 'outline';
  onPress: () => void;
  disabled?: boolean;
}) {
  const black = variant === 'black';
  return (
    <Pressable
      style={[
        calStyles.authBtn,
        black ? calStyles.authBtnBlack : calStyles.authBtnOutline,
        disabled && calStyles.authBtnDisabled,
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text
        style={[
          calStyles.authBtnText,
          black ? calStyles.authBtnTextBlack : calStyles.authBtnTextOutline,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// ——— Date wheel (three snap columns, no native picker dependency) ———

export type WheelDate = { year: number; month: number; day: number };

const WHEEL_ITEM_H = 44;
const WHEEL_VISIBLE = 5;
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function WheelColumn({
  values,
  index,
  onIndexChange,
  flex,
}: {
  values: string[];
  index: number;
  onIndexChange: (i: number) => void;
  flex: number;
}) {
  return (
    <ScrollView
      style={{ flex }}
      showsVerticalScrollIndicator={false}
      snapToInterval={WHEEL_ITEM_H}
      decelerationRate="fast"
      contentOffset={{ x: 0, y: index * WHEEL_ITEM_H }}
      contentContainerStyle={calStyles.wheelContent}
      onMomentumScrollEnd={(e) => {
        const i = Math.min(
          values.length - 1,
          Math.max(0, Math.round(e.nativeEvent.contentOffset.y / WHEEL_ITEM_H)),
        );
        onIndexChange(i);
      }}
    >
      {values.map((v, i) => (
        <View key={v} style={calStyles.wheelItem}>
          <Text
            style={[calStyles.wheelText, i === index && calStyles.wheelTextOn]}
          >
            {v}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}

export function DateWheel({
  value,
  onChange,
}: {
  value: WheelDate;
  onChange: (next: WheelDate) => void;
}) {
  const now = new Date();
  const years: string[] = [];
  for (let y = 1930; y <= now.getFullYear(); y += 1) years.push(String(y));

  const dayCount = daysInMonth(value.year, value.month);
  const days = Array.from({ length: dayCount }, (_, i) => String(i + 1));

  function clampDay(year: number, month: number): number {
    return Math.min(value.day, daysInMonth(year, month));
  }

  return (
    <View style={calStyles.wheelRow}>
      <View style={calStyles.wheelBand} pointerEvents="none" />
      <WheelColumn
        flex={2}
        values={MONTHS}
        index={value.month}
        onIndexChange={(i) =>
          onChange({ ...value, month: i, day: clampDay(value.year, i) })
        }
      />
      <WheelColumn
        flex={1}
        values={days}
        index={Math.min(value.day, dayCount) - 1}
        onIndexChange={(i) => onChange({ ...value, day: i + 1 })}
      />
      <WheelColumn
        flex={1.4}
        values={years}
        index={Math.max(0, value.year - 1930)}
        onIndexChange={(i) =>
          onChange({ ...value, year: 1930 + i, day: clampDay(1930 + i, value.month) })
        }
      />
    </View>
  );
}

const calStyles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: cal.bg },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  backBtn: { width: 32, alignItems: 'flex-start' },
  backHidden: { opacity: 0 },
  track: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: cal.field,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  fill: { backgroundColor: cal.ink, borderRadius: 2 },
  body: { paddingHorizontal: 24, paddingTop: 28, paddingBottom: 24, gap: 12 },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: cal.ink,
    letterSpacing: -0.5,
    lineHeight: 36,
  },
  subtitle: { fontSize: 16, lineHeight: 23, color: cal.sub, marginBottom: 8 },
  footer: { paddingHorizontal: 24, paddingBottom: 12, gap: 12 },
  primary: {
    backgroundColor: cal.ink,
    borderRadius: 999,
    paddingVertical: 18,
    alignItems: 'center',
  },
  primaryOff: { backgroundColor: cal.disabled },
  primaryText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  option: {
    backgroundColor: cal.field,
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 20,
  },
  optionOn: { backgroundColor: cal.ink },
  optionText: { fontSize: 17, fontWeight: '600', color: cal.ink },
  optionTextOn: { color: '#FFFFFF' },
  input: {
    backgroundColor: cal.field,
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 18,
    fontSize: 18,
    color: cal.ink,
  },
  authBtn: {
    borderRadius: 999,
    paddingVertical: 17,
    alignItems: 'center',
  },
  authBtnBlack: { backgroundColor: cal.ink },
  authBtnOutline: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: cal.line,
  },
  authBtnDisabled: { opacity: 0.5 },
  authBtnText: { fontSize: 17, fontWeight: '700' },
  authBtnTextBlack: { color: '#FFFFFF' },
  authBtnTextOutline: { color: cal.ink },
  wheelRow: {
    flexDirection: 'row',
    height: WHEEL_ITEM_H * WHEEL_VISIBLE,
    marginTop: 12,
  },
  wheelBand: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: WHEEL_ITEM_H * 2,
    height: WHEEL_ITEM_H,
    borderRadius: 12,
    backgroundColor: cal.field,
  },
  wheelContent: { paddingVertical: WHEEL_ITEM_H * 2 },
  wheelItem: {
    height: WHEEL_ITEM_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wheelText: { fontSize: 19, color: cal.sub },
  wheelTextOn: { fontSize: 20, fontWeight: '600', color: cal.ink },
});

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
