import { useEffect, type ReactNode } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, Press } from '../../components/v2';
import { useKeyboardHeight } from '../../lib/keyboard';
import { color, control, motion, radius, shadow, space, text } from '../../theme/v2';

/** Creator steps with a progress bar: name, camera and mic, notifications, connect, practice. The finish has none. */
export const CREATOR_STEPS = 5;

export interface OnboardingShellProps {
  /** 1-based step for the progress bar. */
  step: number;
  total?: number;
  onBack?: () => void;
  title: string;
  /** Larger title for a centred finish screen. */
  titleSize?: 'screen' | 'question';
  subtitle?: string;
  children?: ReactNode;
  primaryLabel?: string;
  onPrimary?: () => void;
  primaryDisabled?: boolean;
  /** Spinner in the primary button; the button is disabled meanwhile. */
  primaryBusy?: boolean;
  /** Rendered under the pinned primary button (Not now, Skip). */
  footerExtra?: ReactNode;
  /** Vertically center children in the remaining space. */
  centerContent?: boolean;
}

function ProgressBar({ progress }: { progress: number }) {
  const w = useSharedValue(progress);
  useEffect(() => {
    w.set(withTiming(progress, { duration: motion.pill, easing: motion.ease }));
  }, [progress, w]);
  const fill = useAnimatedStyle(() => ({ width: `${w.get() * 100}%` }));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
      style={{ height: 6, borderRadius: radius.pill, backgroundColor: color.grey2, overflow: 'hidden' }}
    >
      <Animated.View style={[{ height: 6, borderRadius: radius.pill, backgroundColor: color.blue }, fill]} />
    </View>
  );
}

/** Full width 52 high primary with an optional spinner. */
export function PrimaryButton({ label, onPress, disabled, busy }: { label: string; onPress: () => void; disabled?: boolean; busy?: boolean }) {
  const off = disabled || busy;
  return (
    <Press
      accessibilityRole="button"
      accessibilityState={{ disabled: off, busy }}
      disabled={off}
      onPress={onPress}
      style={{ height: control.button, borderRadius: radius.pill, backgroundColor: color.blue, opacity: disabled && !busy ? 0.4 : 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}
    >
      {busy ? <ActivityIndicator size="small" color={color.white} /> : null}
      <Text style={{ fontSize: 17, fontWeight: '700', color: color.white }}>{label}</Text>
    </Press>
  );
}

/** Quiet text button under the primary, 44 high. */
export function QuietButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Press
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={{ height: control.tapMin, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.4 : 1 }}
    >
      <Text style={[text.row, { fontSize: 16, color: color.grey4 }]}>{label}</Text>
    </Press>
  );
}

/** One onboarding step: back and progress, title, body, pinned primary. */
export function OnboardingShell({
  step,
  total = CREATOR_STEPS,
  onBack,
  title,
  titleSize = 'question',
  subtitle,
  children,
  primaryLabel,
  onPrimary,
  primaryDisabled = false,
  primaryBusy = false,
  footerExtra,
  centerContent = false,
}: OnboardingShellProps) {
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardHeight();
  const progress = Math.min(1, Math.max(0, step / total));
  const hasPrimary = primaryLabel !== undefined && onPrimary !== undefined;

  return (
    <View style={{ flex: 1, backgroundColor: color.bg, paddingTop: insets.top }}>
      <View style={{ height: 52, flexDirection: 'row', alignItems: 'center', gap: space[3], paddingLeft: 4, paddingRight: space.screen }}>
        {onBack ? (
          <Press accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="chevron_left" size={32} color={color.ink} />
          </Press>
        ) : (
          <View style={{ width: 44, height: 44 }} />
        )}
        <View style={{ flex: 1 }}>{step > 0 ? <ProgressBar progress={progress} /> : null}</View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ flexGrow: 1, paddingHorizontal: space.screen, paddingTop: space[4], paddingBottom: space[6] }}
      >
        <Animated.View entering={FadeInDown.duration(motion.tabIn).easing(motion.tabEase)} style={{ flex: 1 }}>
          <Text style={[text.title, titleSize === 'screen' ? { fontSize: 34, lineHeight: 40 } : null]}>{title}</Text>
          {subtitle ? <Text style={[text.body, { color: color.grey4, marginTop: space[2], fontSize: 16, lineHeight: 22 }]}>{subtitle}</Text> : null}
          <View style={[{ flex: 1, marginTop: space[6], gap: space[3] }, centerContent ? { justifyContent: 'center' } : null]}>{children}</View>
        </Animated.View>
      </ScrollView>

      {hasPrimary || footerExtra ? (
        <View
          style={{
            paddingTop: space[3],
            paddingHorizontal: space.screen,
            paddingBottom: keyboard ? keyboard + space[3] : Math.max(insets.bottom, space[6]),
            gap: space[1],
            backgroundColor: color.bg,
            ...shadow.footer,
          }}
        >
          {hasPrimary ? <PrimaryButton label={primaryLabel} onPress={onPrimary} disabled={primaryDisabled} busy={primaryBusy} /> : null}
          {footerExtra}
        </View>
      ) : null}
    </View>
  );
}

/** White option card: tinted icon disc, label and hint, a check when done. */
export function StepCard({
  icon,
  label,
  hint,
  done,
  onPress,
  right,
  disabled,
}: {
  icon: Parameters<typeof Icon>[0]['name'];
  label: string;
  hint?: string;
  done?: boolean;
  onPress?: () => void;
  right?: ReactNode;
  disabled?: boolean;
}) {
  const body = (
    <>
      <View style={{ width: 40, height: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: done ? color.greenTint : color.blueTint }}>
        <Icon name={icon} size={20} color={done ? color.green : color.blueDeep} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={text.row}>{label}</Text>
        {hint ? <Text numberOfLines={2} style={[text.meta, { marginTop: 2 }]}>{hint}</Text> : null}
      </View>
      {right ?? (done ? <Icon name="check_circle" size={24} color={color.green} /> : onPress ? <Icon name="chevron_right" size={22} color={color.grey3} /> : null)}
    </>
  );
  const style = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space[3],
    padding: space[4],
    minHeight: 72,
    backgroundColor: color.card,
    borderRadius: radius.option,
    borderWidth: 1.5,
    borderColor: done ? color.green : 'transparent',
    ...shadow.card,
  };
  if (!onPress) return <View style={style}>{body}</View>;
  return (
    <Press accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ checked: done, disabled }} disabled={disabled} onPress={onPress} style={style}>
      {body}
    </Press>
  );
}
