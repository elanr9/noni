import { Text, type StyleProp, type ViewStyle } from 'react-native';

import { color, control, radius, text } from '../../theme/v2';
import { Icon, type IconName } from './Icon';
import { Press } from './Press';

export type ButtonVariant = 'primary' | 'ink' | 'secondary' | 'quiet' | 'amber';

const VARIANT: Record<ButtonVariant, { bg: string; fg: string }> = {
  primary: { bg: color.blue, fg: color.white },
  ink: { bg: color.ink, fg: color.white },
  secondary: { bg: color.blueTint, fg: color.blueDeep },
  quiet: { bg: color.grey1, fg: color.ink },
  amber: { bg: color.amberTint, fg: color.amber },
};

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  /** 36 high, 700 15, sized to its label. */
  pill?: boolean;
  icon?: IconName;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** 52 high, r999, 700 17, flex 1 in a footer row. Disabled is 0.4 opacity. */
export function Button({ label, onPress, variant = 'primary', pill, icon, disabled, style }: ButtonProps) {
  const v = VARIANT[variant];
  return (
    <Press
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={[
        {
          height: pill ? control.pill : control.button,
          paddingHorizontal: pill ? 16 : 24,
          borderRadius: radius.pill,
          backgroundColor: v.bg,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          opacity: disabled ? 0.4 : 1,
        },
        pill ? { flexGrow: 0, flexShrink: 0 } : { flex: 1 },
        style,
      ]}
    >
      {icon ? <Icon name={icon} size={20} weight={700} color={v.fg} /> : null}
      <Text numberOfLines={1} style={{ fontSize: pill ? 15 : 17, fontWeight: '700', color: v.fg }}>
        {label}
      </Text>
    </Press>
  );
}

/** Blue word in a header: 600 17, 44 high. */
export function TextButton({ label, onPress }: { label: string; onPress?: () => void }) {
  return (
    <Press onPress={onPress} accessibilityRole="button" style={{ height: control.tapMin, paddingHorizontal: 12, justifyContent: 'center' }}>
      <Text style={[text.row, { color: color.blue }]}>{label}</Text>
    </Press>
  );
}
