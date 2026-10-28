import { Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { control, radius, tone as tones, type Tone } from '../../theme/v2';
import { Icon, type IconName } from './Icon';

export interface ChipProps {
  label: string;
  tone?: Tone;
  icon?: IconName;
  /** 22 high, 12px: state chips inside rows. */
  small?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** 26 high, r999, padding 0 10, 700 13, tint bg and deep text, optional 14px icon. */
export function Chip({ label, tone = 'blue', icon, small, style }: ChipProps) {
  const t = tones[tone];
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          alignSelf: 'flex-start',
          gap: 4,
          height: small ? control.chipSmall : control.chip,
          paddingHorizontal: 10,
          borderRadius: radius.pill,
          backgroundColor: t.tint,
        },
        style,
      ]}
    >
      {icon ? <Icon name={icon} size={14} color={t.text} /> : null}
      <Text numberOfLines={1} style={{ fontSize: small ? 12 : 13, fontWeight: '700', color: t.text }}>
        {label}
      </Text>
    </View>
  );
}
