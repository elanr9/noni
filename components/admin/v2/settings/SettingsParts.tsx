import type { ReactNode } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { color, control, radius, shadow, space, text } from '../../../../theme/v2';
import { Icon, type IconName } from '../../../v2/Icon';
import { Press } from '../../../v2/Press';

/** Uppercase 700 12 grey-4 label above a settings card, optional right action. */
export function SettingsLabel({ children, right }: { children: string; right?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: space[3], marginBottom: space[2], minHeight: 28 }}>
      <Text style={{ flex: 1, fontSize: 12, lineHeight: 16, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase', color: color.grey4 }}>
        {children}
      </Text>
      {right}
    </View>
  );
}

/** White card holding rows, no inner padding (rows pad themselves). */
export function SettingsCard({ children }: { children: ReactNode }) {
  return <View style={{ backgroundColor: color.card, borderRadius: radius.card, overflow: 'hidden', marginBottom: space[2], ...shadow.card }}>{children}</View>;
}

export interface SettingsRowProps {
  icon: IconName;
  label: string;
  sub?: string;
  /** Right side value text, grey. */
  value?: string;
  /** Replaces the chevron (a toggle, a spinner). */
  right?: ReactNode;
  danger?: boolean;
  last?: boolean;
  /** Opens outside the app: shows open_in_new instead of the chevron. */
  external?: boolean;
  onPress?: () => void;
}

/** 56+ high row: tinted icon disc, label and optional sub, value or chevron. */
export function SettingsRow({ icon, label, sub, value, right, danger, last, external, onPress }: SettingsRowProps) {
  const body = (
    <>
      <View style={{ width: 34, height: 34, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: danger ? color.pinkTint : color.blueTint }}>
        <Icon name={icon} size={19} color={danger ? color.pink : color.blueDeep} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={[text.row, { fontSize: 16, color: danger ? color.pink : color.ink }]}>
          {label}
        </Text>
        {sub ? (
          <Text numberOfLines={2} style={[text.meta, { marginTop: 1 }]}>
            {sub}
          </Text>
        ) : null}
      </View>
      {value ? <Text style={[text.meta, { fontSize: 15 }]}>{value}</Text> : null}
      {right ?? (onPress && !danger ? <Icon name={external ? 'open_in_new' : 'chevron_right'} size={external ? 18 : 22} color={color.grey3} /> : null)}
    </>
  );
  const style = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    minHeight: control.row + 4,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: last ? 0 : 1,
    borderBottomColor: color.grey1,
  };
  if (!onPress) return <View style={style}>{body}</View>;
  return (
    <Press accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={style}>
      {body}
    </Press>
  );
}

/** 36px white circle with a card shadow, for header actions. */
export function CircleButton({ icon, label, onPress, danger }: { icon: IconName; label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{ width: 36, height: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: danger ? color.pinkTint : color.card, ...shadow.card }}
    >
      <Icon name={icon} size={18} color={danger ? color.pink : color.grey4} />
    </Press>
  );
}

/** Full width 52 high button with a spinner while busy. Pink for destructive actions. */
export function ActionButton({
  label,
  busyLabel,
  busy,
  disabled,
  tone = 'danger',
  onPress,
}: {
  label: string;
  busyLabel?: string;
  busy?: boolean;
  disabled?: boolean;
  tone?: 'danger' | 'primary' | 'quiet';
  onPress: () => void;
}) {
  const bg = tone === 'danger' ? color.pink : tone === 'primary' ? color.blue : color.grey1;
  const fg = tone === 'quiet' ? color.ink : color.white;
  const off = disabled || busy;
  return (
    <Press
      accessibilityRole="button"
      accessibilityState={{ disabled: off, busy }}
      disabled={off}
      onPress={onPress}
      style={{ flex: 1, height: control.button, borderRadius: radius.pill, backgroundColor: bg, opacity: disabled && !busy ? 0.4 : 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}
    >
      {busy ? (
        <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)}>
          <ActivityIndicator size="small" color={fg} />
        </Animated.View>
      ) : null}
      <Text style={{ fontSize: 17, fontWeight: '700', color: fg }}>{busy && busyLabel ? busyLabel : label}</Text>
    </Press>
  );
}

/** Grey body copy inside a sheet. */
export function SheetBody({ children, tone }: { children: ReactNode; tone?: 'error' }) {
  return <Text style={[text.body, { color: tone === 'error' ? color.pink : color.grey4, lineHeight: 21 }]}>{children}</Text>;
}
