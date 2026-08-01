import type { ReactNode } from 'react';
import { StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { color, shadow } from '../../theme/tokens';
import { Icon, type IconName } from './Icon';
import { PressableScale } from './PressableScale';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'tint'
  | 'outline'
  | 'ghost'
  | 'danger'
  | 'approve';

export type ButtonSize = 'lg' | 'md' | 'sm';

interface VariantStyle {
  bg: string;
  fg: string;
  borderColor?: string;
  shadow?: ViewStyle;
}

const VARIANTS: Record<ButtonVariant, VariantStyle> = {
  primary: { bg: color.accent, fg: color.white, shadow: shadow.shadowAccent },
  secondary: { bg: color.ink, fg: color.white },
  tint: { bg: color.blue100, fg: color.blue700 },
  outline: { bg: 'transparent', fg: color.ink, borderColor: color.borderStrong },
  ghost: { bg: 'transparent', fg: color.textMuted },
  danger: { bg: color.danger, fg: color.white },
  approve: { bg: color.green, fg: color.white },
};

const SIZES: Record<
  ButtonSize,
  { height: number; fontSize: number; fontWeight: '700' | '800'; paddingHorizontal: number; icon: number }
> = {
  lg: { height: 60, fontSize: 17, fontWeight: '800', paddingHorizontal: 28, icon: 20 },
  md: { height: 48, fontSize: 15, fontWeight: '700', paddingHorizontal: 20, icon: 18 },
  sm: { height: 40, fontSize: 14, fontWeight: '700', paddingHorizontal: 16, icon: 18 },
};

export interface ButtonProps {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  icon?: IconName;
  iconRight?: IconName;
  disabled?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  block = false,
  icon,
  iconRight,
  disabled = false,
  onPress,
  style,
}: ButtonProps) {
  const v = VARIANTS[variant];
  const s = SIZES[size];

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.base,
        {
          height: s.height,
          paddingHorizontal: s.paddingHorizontal,
          backgroundColor: v.bg,
        },
        v.borderColor !== undefined && { borderWidth: 1.5, borderColor: v.borderColor },
        v.shadow,
        block && styles.block,
        disabled && styles.disabled,
        style,
      ]}
    >
      {icon !== undefined && <Icon name={icon} size={s.icon} color={v.fg} />}
      <Text
        style={{
          color: v.fg,
          fontSize: s.fontSize,
          fontWeight: s.fontWeight,
          letterSpacing: -0.1,
        }}
      >
        {children}
      </Text>
      {iconRight !== undefined && <Icon name={iconRight} size={s.icon} color={v.fg} />}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  block: {
    alignSelf: 'stretch',
  },
  disabled: {
    opacity: 0.35,
  },
});
